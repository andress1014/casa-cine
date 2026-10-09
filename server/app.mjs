import express from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { rm, statfs, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { makeConfig, root } from './config.mjs';
import { createStore, publicMedia } from './store.mjs';
import { createMediaQueue, originalPath, probe } from './media.mjs';
import { localOnly, localUrls, isLocalAddress, createAccess, localIdentity } from './network.mjs';

const extensions = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.wmv', '.ts'];
const mimeTypes = ['video/mp4','video/x-m4v','video/quicktime','video/webm','video/x-matroska',
  'video/x-msvideo','video/avi','video/mpeg','video/x-ms-wmv','video/mp2t','application/octet-stream'];
const categories = ['Películas', 'Series', 'En familia', 'Recuerdos', 'Otros'];
const text = z.string().trim().max(160).refine(v => !/[\x00-\x1f]/.test(v));
const metadataSchema = z.object({ title: text.min(1), description: z.string().trim().max(2000).default(''),
  category: z.enum(categories).default('Películas'), addedBy: text.max(60).default('Alguien de casa') }).strict();
const idSchema = z.uuid();

export async function createApplication(options = {}) {
  const config = makeConfig(options);
  const store = createStore(config.dataDir);
  const queue = createMediaQueue(config, store);
  const access = createAccess(config.houseCode);
  // A crashed upload is never visible in the library. Recover interrupted conversions.
  for (const filename of await readdir(config.scratch)) await rm(path.join(config.scratch, filename), { force: true });
  for (const m of store.list()) if (m.status === 'processing') queue.enqueue(m.id);
  const app = express();
  app.disable('x-powered-by');
  app.use(localOnly);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (!config.dev) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ required: access.required, authenticated: access.authenticated(req) });
  });
  app.post('/api/session', (req, res) => access.login(req, res, z.object({ code: z.string().max(128) }).strict().parse(req.body).code));
  app.delete('/api/session', (_req, res) => {
    res.setHeader('Set-Cookie', 'casacine=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.use('/api', access.guard, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/system', (req, res) => {
    const urls = localUrls(config.port);
    const host = req.hostname.replace(/^\[|\]$/g, '');
    if (isLocalAddress(host) && !['127.0.0.1','::1'].includes(host)) urls.unshift(`http://${req.headers.host}`);
    res.json({ name: 'CasaCine', version: '1.0.0', categories,
      urls: [...new Set(urls)], maxUploadBytes: config.maxUploadBytes, protected: access.required });
  });
  app.get('/api/device', (req, res) => res.json({ user: localIdentity(req.socket.remoteAddress) }));
  app.get('/api/media', (_req, res) => res.json({ media: store.list().map(publicMedia) }));

  let activeUploads = 0;
  app.post('/api/media', async (req, res, next) => {
    if (activeUploads >= 4) return res.status(429).json({ error: 'Hay varias subidas en curso. Intenta de nuevo en un momento.' });
    const length = Number(req.headers['content-length'] || 0);
    if (length > config.maxUploadBytes + 1024 * 1024) return res.status(413).json({ error: 'Este archivo supera el límite de subida.' });
    const disk = await statfs(config.dataDir);
    if (length && disk.bavail * disk.bsize < length + 100 * 1024 ** 2) return res.status(507).json({ error: 'Falta espacio en la PC para guardar este video.' });
    activeUploads++;
    let released = false;
    const release = () => { if (!released) { released = true; activeUploads--; } };
    res.once('finish', release); res.once('close', release);
    const upload = multer({ storage: multer.diskStorage({ destination: config.scratch,
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }),
      limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4, fieldSize: 8192, parts: 5, headerPairs: 100 },
      fileFilter: (_req, file, callback) => {
        const safe = z.string().min(1).max(255).refine(v => !/[\x00-\x1f]/.test(v)).safeParse(file.originalname);
        if (!safe.success || !extensions.includes(path.extname(file.originalname).toLowerCase()) || !mimeTypes.includes(file.mimetype)) {
          return callback(Object.assign(new Error('INVALID_FILE'), { publicStatus: 415, publicMessage: 'Elige un archivo de video: MP4, MKV, MOV, AVI o WebM.' }));
        }
        callback(null, true);
      },
    }).single('video');
    upload(req, res, async error => {
      let savedPath;
      try {
        if (error) throw error;
        if (!req.file || !req.file.size) throw Object.assign(new Error('EMPTY_FILE'), { publicStatus: 400, publicMessage: 'Selecciona un video con contenido.' });
        const metadata = metadataSchema.parse(req.body);
        let info;
        try { info = await probe(req.file.path); }
        catch { throw Object.assign(new Error('INVALID_VIDEO'), { publicStatus: 415, publicMessage: 'Este archivo no contiene un video válido o está dañado.' }); }
        if (req.destroyed && !req.complete) throw new Error('ABORTED');
        const m = { id: randomUUID(), ...metadata, originalName: req.file.originalname,
          extension: path.extname(req.file.originalname).toLowerCase(), size: req.file.size,
          createdAt: new Date().toISOString(), ...info };
        savedPath = originalPath(config, m);
        await rename(req.file.path, savedPath);
        store.add(m);
        queue.enqueue(m.id);
        res.status(201).json({ media: publicMedia(store.get(m.id)) });
      } catch (err) {
        if (req.file) await rm(req.file.path, { force: true }).catch(() => {});
        if (savedPath) await rm(savedPath, { force: true }).catch(() => {});
        next(err);
      }
    });
  });

  function find(req) {
    const id = idSchema.parse(req.params.id);
    const m = store.get(id);
    if (!m) throw Object.assign(new Error('NOT_FOUND'), { publicStatus: 404, publicMessage: 'Este video ya no está en la biblioteca.' });
    return m;
  }
  app.get('/api/media/:id', (req, res) => res.json({ media: publicMedia(find(req)) }));
  app.patch('/api/media/:id', (req, res) => {
    const m = find(req); store.edit(m.id, metadataSchema.parse(req.body));
    res.json({ media: publicMedia(store.get(m.id)) });
  });
  app.post('/api/media/:id/retry', (req, res) => {
    const m = find(req);
    if (m.status !== 'error') return res.status(409).json({ error: 'Este video ya está listo o se está preparando.' });
    store.state(m.id, { status: 'processing', progress: 0, error: null }); queue.enqueue(m.id);
    res.status(202).json({ media: publicMedia(store.get(m.id)) });
  });
  app.get('/api/media/:id/stream', (req, res, next) => {
    const m = find(req);
    if (m.status !== 'ready') return res.status(409).json({ error: 'Estamos preparando este video. Pronto estará listo.' });
    const file = m.playable === 'prepared' ? path.join(config.prepared, `${m.id}.mp4`) : originalPath(config, m);
    res.type('video/mp4');
    res.sendFile(file, { acceptRanges: true, cacheControl: false }, error => { if (error) next(error); });
  });
  app.get('/api/media/:id/poster', (req, res, next) => {
    const m = find(req);
    if (!m.poster) return res.status(404).end();
    res.sendFile(path.join(config.posters, `${m.id}.jpg`), { cacheControl: false }, error => { if (error) next(error); });
  });
  app.get('/api/media/:id/download', (req, res, next) => {
    const m = find(req); res.download(originalPath(config, m), m.originalName, error => { if (error) next(error); });
  });
  app.delete('/api/media/:id', async (req, res) => {
    const m = find(req);
    if (m.status === 'processing') return res.status(409).json({ error: 'Espera a que termine la preparación antes de eliminarlo.' });
    store.remove(m.id);
    for (const file of [originalPath(config, m), path.join(config.prepared, `${m.id}.mp4`), path.join(config.posters, `${m.id}.jpg`)]) {
      await rm(file, { force: true }).catch(() => console.warn('FILE_CLEANUP_FAILED'));
    }
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Esta ruta no existe.' }));
  let vite;
  if (config.dev) {
    const { createServer } = await import('vite');
    vite = await createServer({ root, server: { middlewareMode: true } });
    app.use(vite.middlewares);
  } else {
    const build = path.join(root, 'dist');
    app.use(express.static(build));
    app.get('/{*path}', (_req, res) => {
      if (existsSync(path.join(build, 'index.html'))) res.sendFile(path.join(build, 'index.html'));
      else res.status(503).type('text').send('Ejecuta npm run build antes de iniciar CasaCine.');
    });
  }
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZodError) return res.status(400).json({ error: 'Revisa los datos: título obligatorio, categoría válida y textos dentro del límite.' });
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Este archivo supera el límite de subida.' : 'Sube un video por vez y revisa sus datos.' });
    if (error.publicStatus) return res.status(error.publicStatus).json({ error: error.publicMessage });
    if (error.status === 416) return res.status(416).end();
    if (error.status === 400) return res.status(400).json({ error: 'Solicitud inválida.' });
    if (error.status === 413) return res.status(413).json({ error: 'Solicitud demasiado grande.' });
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'No encontramos este archivo en la PC.' });
    console.error('REQUEST_FAILED');
    res.status(500).json({ error: 'Algo falló en la PC. Intenta nuevamente.' });
  });
  return { app, config, store, queue, async close() { await queue.close(); await vite?.close(); store.close(); } };
}
