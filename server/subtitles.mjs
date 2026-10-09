import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { convertSubtitle, subtitleLimit, subtitlePath } from './media-extras.mjs';

const uuid = z.uuid();
const metadata = z.object({ label: z.string().trim().min(1).max(80).refine(v => !/[\x00-\x1f]/.test(v)), language: z.string().regex(/^[a-z]{2,3}(-[a-zA-Z]{2})?$/).default('und') }).strict();
const problem = (status,message) => Object.assign(new Error('SUBTITLE_REQUEST_FAILED'),{ publicStatus: status, publicMessage: message });
export function createSubtitlesRouter(config,store,queue) {
  const router = express.Router();
  const find = req => { const m = store.get(uuid.parse(req.params.id)); if (!m) throw problem(404,'Este video ya no está en biblioteca.'); return m; };
  const tracks = m => JSON.parse(m.subtitleTracks || '[]');
  const upload = multer({ storage: multer.diskStorage({ destination: config.fileScratch, filename: (_req,file,cb) => cb(null,`${randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }),
    limits: { fileSize: subtitleLimit, files: 1, fields: 2, fieldSize: 512, parts: 3 }, fileFilter: (_req,file,cb) => cb(['.srt','.vtt'].includes(path.extname(file.originalname).toLowerCase()) ? null : problem(415,'Selecciona subtítulos SRT o VTT.'),true) }).single('subtitle');
  router.post('/media/:id/subtitles',(req,res,next) => {
    let m;
    try { m = find(req); if (m.status !== 'ready' || queue.isBusy(m.id)) throw problem(409,'Espera a que termine preparación de video.'); if (tracks(m).length >= 24) throw problem(409,'Máximo 24 pistas de subtítulos por video.'); }
    catch (error) { return next(error); }
    upload(req,res,async error => {
      let destination;
      try {
        if (error) throw error;
        if (!req.file) throw problem(400,'Selecciona archivo de subtítulos.');
        const values = metadata.parse(req.body), id = randomUUID();
        await mkdir(path.join(config.subtitles,m.id),{ recursive: true }); destination = subtitlePath(config,m.id,id);
        try { await convertSubtitle(req.file.path,path.extname(req.file.originalname).toLowerCase(),destination); }
        catch { throw problem(415,'Subtítulos inválidos. Usa SRT/VTT con texto UTF-8 y tiempos válidos.'); }
        const current = store.get(m.id);
        if (!current) throw problem(404,'Video fue eliminado durante subida.');
        if (queue.isBusy(m.id)) throw problem(409,'Preparación en curso. Vuelve a añadir subtítulos al terminar.');
        const list = tracks(current); if (list.length >= 24) throw problem(409,'Máximo 24 pistas de subtítulos.');
        list.push({ id,...values,forced: false,source: 'external' });
        store.extras(m.id,list,JSON.parse(current.subtitleWarnings || '[]'),current.posterSource);
        destination = undefined; res.status(201).json({ ok: true });
      } catch (err) { if (destination) await rm(destination,{ force: true }); next(err); }
      finally { if (req.file) await rm(req.file.path,{ force: true }); }
    });
  });
  router.get('/media/:id/subtitles/:trackId',(req,res,next) => {
    const m = find(req), id = uuid.parse(req.params.trackId);
    if (!tracks(m).some(track => track.id === id)) throw problem(404,'Pista no existe.');
    res.type('text/vtt').sendFile(subtitlePath(config,m.id,id),{ cacheControl: false },error => { if (error) next(error); });
  });
  router.delete('/media/:id/subtitles/:trackId',async(req,res) => {
    const m = find(req), id = uuid.parse(req.params.trackId), track = tracks(m).find(t => t.id === id);
    if (!track) throw problem(404,'Pista no existe.');
    if (track.source !== 'external') throw problem(409,'Pistas incrustadas pertenecen a archivo original. Puedes desactivarlas en reproductor.');
    if (queue.isBusy(m.id)) throw problem(409,'Espera a que termine preparación.');
    store.extras(m.id,tracks(m).filter(t => t.id !== id),JSON.parse(m.subtitleWarnings || '[]'),m.posterSource);
    await rm(subtitlePath(config,m.id,id),{ force: true }); res.json({ ok: true });
  });
  router.post('/media/:id/metadata/refresh',(req,res) => {
    const m = find(req); if (m.status !== 'ready' || queue.isBusy(m.id)) throw problem(409,'Preparación ya está en curso.');
    queue.enqueueExtras(m.id); res.status(202).json({ ok: true });
  });
  return router;
}
