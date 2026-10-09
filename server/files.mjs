import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rename, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { publicFile } from './file-store.mjs';

const uuid = z.uuid();
const label = z.string().trim().min(1).max(160).refine(v => !/[\x00-\x1f\\/]/.test(v) && !['.', '..'].includes(v));
const folderSchema = z.object({ name: label.max(80), parentId: uuid.nullable().default(null) }).strict();
const metadata = z.object({ title: label, originalName: label.max(255), addedBy: label.max(60), folderId: uuid.nullable().default(null) }).strict();
const searchSchema = z.object({ folder: z.union([z.enum(['root','all']),uuid]).default('root'), search: z.string().trim().max(160).default(''),
  kind: z.enum(['all','document','image','archive','text']).default('all'), offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(100).default(60) }).strict();
const types = {
  '.pdf': ['document','application/pdf'], '.doc': ['document','application/msword'], '.docx': ['document','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['document','application/vnd.ms-excel'], '.xlsx': ['document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['document','application/vnd.ms-powerpoint'], '.pptx': ['document','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.odt': ['document','application/vnd.oasis.opendocument.text'], '.ods': ['document','application/vnd.oasis.opendocument.spreadsheet'], '.odp': ['document','application/vnd.oasis.opendocument.presentation'],
  '.txt': ['text','text/plain'], '.md': ['text','text/markdown','text/plain'], '.csv': ['text','text/csv','application/vnd.ms-excel'], '.json': ['text','application/json','text/plain'],
  '.jpg': ['image','image/jpeg'], '.jpeg': ['image','image/jpeg'], '.png': ['image','image/png'], '.gif': ['image','image/gif'], '.webp': ['image','image/webp'],
  '.zip': ['archive','application/zip','application/x-zip-compressed'], '.rar': ['archive','application/vnd.rar','application/x-rar-compressed'], '.7z': ['archive','application/x-7z-compressed'],
};
export const fileExtensions = Object.keys(types);
const fail = (status,message) => Object.assign(new Error('FILE_OPERATION_FAILED'),{ publicStatus: status, publicMessage: message });
function filePath(config,id) { return path.join(config.documents,`${uuid.parse(id)}.blob`); }
const starts = (buffer,hex) => buffer.subarray(0,hex.length / 2).equals(Buffer.from(hex,'hex'));
async function validateContent(filename,extension) {
  const handle = await open(filename,'r'); const bytes = Buffer.alloc(4096);
  let length; try { ({ bytesRead: length } = await handle.read(bytes,0,bytes.length,0)); } finally { await handle.close(); }
  const sample = bytes.subarray(0,length), zip = starts(sample,'504b0304') || starts(sample,'504b0506'), office = starts(sample,'d0cf11e0a1b11ae1');
  let valid;
  switch (extension) {
    case '.pdf': valid = sample.subarray(0,5).toString() === '%PDF-'; break;
    case '.doc': valid = office || sample.subarray(0,5).toString() === '{\\rtf'; break;
    case '.xls': case '.ppt': valid = office; break;
    case '.docx': case '.xlsx': case '.pptx': valid = zip || office; break;
    case '.odt': case '.ods': case '.odp': case '.zip': valid = zip; break;
    case '.jpg': case '.jpeg': valid = starts(sample,'ffd8ff'); break;
    case '.png': valid = starts(sample,'89504e470d0a1a0a'); break;
    case '.gif': valid = ['GIF87a','GIF89a'].includes(sample.subarray(0,6).toString()); break;
    case '.webp': valid = sample.subarray(0,4).toString() === 'RIFF' && sample.subarray(8,12).toString() === 'WEBP'; break;
    case '.rar': valid = starts(sample,'526172211a07'); break;
    case '.7z': valid = starts(sample,'377abcaf271c'); break;
    default: valid = !sample.includes(0) && !starts(sample,'4d5a') && !starts(sample,'7f454c46');
  }
  if (!valid) throw fail(415,'Contenido no coincide con formato de archivo. Revisa extensión.');
}

export function createFilesRouter(config,store) {
  const router = Router(); let uploading = 0;
  function folder(id) {
    const value = store.folder(uuid.parse(id)); if (!value) throw fail(404,'Esta carpeta ya no existe.'); return value;
  }
  function checkFolder(id) { if (id !== null) folder(id); }
  function file(id) { const value = store.get(uuid.parse(id)); if (!value) throw fail(404,'Este archivo ya no está en casa.'); return value; }
  function uniqueFolder(name,parentId,except = null) {
    if (store.folders().some(f => f.id !== except && f.parentId === parentId && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw fail(409,'Ya existe carpeta con ese nombre aquí.');
  }
  router.get('/files/config',(_req,res) => res.json({ maxUploadBytes: config.maxFileUploadBytes, extensions: fileExtensions }));
  router.get('/folders',(_req,res) => res.json({ folders: store.folders() }));
  router.post('/folders',(req,res) => {
    const value = folderSchema.parse(req.body); checkFolder(value.parentId); uniqueFolder(value.name,value.parentId);
    let depth = 0, parent = value.parentId;
    while (parent !== null) { if (++depth >= 12) throw fail(400,'Máximo 12 niveles de carpetas.'); parent = folder(parent).parentId; }
    const item = { id: randomUUID(), ...value, createdAt: new Date().toISOString() }; store.addFolder(item); res.status(201).json({ folder: item });
  });
  router.patch('/folders/:id',(req,res) => {
    const item = folder(req.params.id), { name } = z.object({ name: label.max(80) }).strict().parse(req.body);
    uniqueFolder(name,item.parentId,item.id); store.renameFolder(item.id,name); res.json({ folder: store.folder(item.id) });
  });
  router.delete('/folders/:id',(req,res) => {
    const item = folder(req.params.id); if (store.childCount(item.id)) throw fail(409,'Mueve o elimina contenido antes de borrar carpeta.');
    store.removeFolder(item.id); res.json({ ok: true });
  });
  router.post('/files/search',(req,res) => {
    const filters = searchSchema.parse(req.body); if (!['root','all'].includes(filters.folder)) folder(filters.folder);
    res.json(store.search(filters));
  });
  router.post('/files',async (req,res,next) => {
    if (uploading >= 4) return res.status(429).json({ error: 'Hay varias subidas en curso. Intenta en un momento.' });
    const length = Number(req.headers['content-length'] || 0);
    if (length > config.maxFileUploadBytes + 1024 ** 2) throw fail(413,'Archivo supera límite de subida.');
    const disk = await statfs(config.dataDir);
    if (length && disk.bavail * disk.bsize < length + 100 * 1024 ** 2) throw fail(507,'Falta espacio en disco de servidor.');
    uploading++; let released = false;
    const release = () => { if (!released) { released = true; uploading--; } }; res.once('finish',release); res.once('close',release);
    const upload = multer({ preservePath: true, storage: multer.diskStorage({ destination: config.fileScratch, filename: (_r,_f,cb) => cb(null,randomUUID()) }),
      limits: { fileSize: config.maxFileUploadBytes, files: 1, fields: 4, fieldSize: 2048, parts: 5, headerPairs: 100 },
      fileFilter: (_r,f,cb) => {
        const checked = label.max(255).safeParse(f.originalname), extension = path.extname(f.originalname).toLowerCase(), type = types[extension];
        if (!checked.success || !type || !['application/octet-stream',...type.slice(1)].includes(f.mimetype)) return cb(fail(415,'Formato no admitido. Usa documentos, imágenes o ZIP/RAR/7z.'));
        cb(null,true);
      },
    }).single('file');
    upload(req,res,async error => {
      let saved;
      try {
        if (error) throw error;
        if (!req.file?.size) throw fail(400,'Selecciona archivo con contenido.');
        const value = metadata.parse({ ...req.body, folderId: req.body.folderId || null });
        const extension = path.extname(req.file.originalname).toLowerCase();
        if (path.extname(value.originalName).toLowerCase() !== extension) throw fail(400,'Nombre y extensión no coinciden.');
        checkFolder(value.folderId); await validateContent(req.file.path,extension);
        const hash = createHash('sha256'); for await (const chunk of createReadStream(req.file.path)) hash.update(chunk);
        if (req.destroyed && !req.complete) throw fail(400,'Subida interrumpida. Vuelve a intentar.');
        const item = { id: randomUUID(), ...value, extension, kind: types[extension][0], size: req.file.size, createdAt: new Date().toISOString(), sha256: hash.digest('hex') };
        checkFolder(value.folderId); saved = filePath(config,item.id); await rename(req.file.path,saved); store.add(item);
        res.status(201).json({ file: publicFile(store.get(item.id)) });
      } catch (problem) {
        if (req.file) await rm(req.file.path,{ force: true }).catch(() => {});
        if (saved) await rm(saved,{ force: true }).catch(() => {}); next(problem);
      }
    });
  });
  router.patch('/files/:id',(req,res) => {
    const item = file(req.params.id), value = z.object({ title: label, folderId: uuid.nullable() }).strict().parse(req.body);
    checkFolder(value.folderId); store.edit(item.id,value.title,value.folderId); res.json({ file: publicFile(store.get(item.id)) });
  });
  router.get('/files/:id/download',(req,res,next) => {
    const item = file(req.params.id);
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'none'");
    res.download(filePath(config,item.id),`${item.title}${item.extension}`,{ headers: { 'Content-Type': 'application/octet-stream' } },error => { if (error) next(error); });
  });
  router.delete('/files/:id',async (req,res) => {
    const item = file(req.params.id); await rm(filePath(config,item.id),{ force: true }); store.remove(item.id); res.json({ ok: true });
  });
  return router;
}
