import { Router, raw } from 'express';
import multer from 'multer';
import { z } from 'zod';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { rename, rm, readFile, writeFile, statfs } from 'node:fs/promises';
import { publicGame } from './game-store.mjs';
import { gameSystems, gameFail as fail, validateGame, validateBios } from './game-formats.mjs';
import { run, ffmpegPath } from './media.mjs';
import { localUrls } from './network.mjs';
import { root } from './config.mjs';

const uuid = z.uuid();
const label = z.string().trim().min(1).max(160).refine(v => !/[\x00-\x1f]/.test(v));
const filename = label.max(255).refine(v => !/[\\/:]/.test(v) && !['.','..'].includes(v));
const region = z.enum(['auto','us','eu','jp']);
const metadata = z.object({ title: label, system: z.enum(['psx','snes']), region: region.default('auto'), addedBy: label.max(60) }).strict();
const maxSave = 64 * 1024 ** 2;
export const emulatorRoot = path.join(root,'vendor/emulatorjs/4.2.3');
export function emulatorReady() {
  return ['loader.js','emulator.min.js','emulator.min.css','cores/pcsx_rearmed-wasm.data','cores/pcsx_rearmed-legacy-wasm.data',
    'cores/snes9x-wasm.data','cores/snes9x-legacy-wasm.data'].every(f => existsSync(path.join(emulatorRoot,'data',f)))
    && existsSync(path.join(emulatorRoot,'installed.json'));
}

export function createGamingRouter(config,store) {
  const router = Router(); let uploading = 0;
  const romPath = g => path.join(config.games,`${g.id}${g.extension}`);
  function game(id) { const g = store.get(uuid.parse(id)); if (!g) throw fail(404,'Juego ya no está en biblioteca.'); return g; }
  function player(id) { const p = store.player(uuid.parse(id)); if (!p) throw fail(404,'Escoge perfil de jugador.'); return p; }
  function kind(k) { return z.enum(['state','sram']).parse(k); }
  const send = (res,file,type,next) => { res.type(type); res.sendFile(file,{ cacheControl: false },e => { if (e) next(e); }); };

  async function uploadFile(req,res,next,{ field,limit,extensions,save }) {
    if (uploading >= 2) return res.status(429).json({ error: 'Hay subidas Gaming en curso. Intenta en un momento.' });
    const length = Number(req.headers['content-length'] || 0);
    if (length > limit+1024**2) throw fail(413,'Archivo supera límite Gaming.');
    const disk = await statfs(config.dataDir);
    if (length && disk.bavail*disk.bsize < length+100*1024**2) throw fail(507,'Falta espacio en servidor para guardar archivo.');
    uploading++; let released = false;
    const release = () => { if (!released) { released = true; uploading--; } }; res.once('finish',release); res.once('close',release);
    const upload = multer({ preservePath: true, storage: multer.diskStorage({ destination: config.gameScratch, filename: (_r,_f,cb) => cb(null,randomUUID()) }),
      limits: { fileSize: limit, files: 1, fields: 4, fieldSize: 1024, parts: 5, headerPairs: 100 },
      fileFilter: (_r,f,cb) => {
        if (!filename.safeParse(f.originalname).success || !extensions.includes(path.extname(f.originalname).toLowerCase())) return cb(fail(415,'Formato Gaming no admitido. Revisa consola y archivo seleccionado.'));
        cb(null,true);
      },
    }).single(field);
    upload(req,res,async error => {
      try {
        if (error) throw error;
        if (!req.file?.size) throw fail(400,'Selecciona archivo con contenido.');
        if (req.destroyed && !req.complete) throw fail(400,'Subida interrumpida.');
        await save(req.file);
      } catch (e) { next(e); }
      finally { if (req.file) await rm(req.file.path,{ force: true }).catch(() => {}); }
    });
  }

  router.get('/gaming/config',(_req,res) => res.json({ systems: gameSystems, emulatorVersion: '4.2.3', emulatorReady: emulatorReady(),
    maxUploadBytes: config.maxGameUploadBytes, maxSaveBytes: maxSave, bios: store.bios().map(({ region,filename,md5 }) => ({ region,filename,md5 })),
    httpsUrls: config.tlsCert && config.tlsKey ? [`https://localhost:${config.tlsPort}`,...localUrls(config.tlsPort).map(u => u.replace('http:','https:'))] : [] }));
  router.get('/gaming/games',(_req,res) => res.json({ games: store.list().map(publicGame) }));
  router.get('/gaming/players',(_req,res) => res.json({ players: store.players() }));
  router.post('/gaming/players',(req,res) => {
    const { name } = z.object({ name: label.max(60) }).strict().parse(req.body);
    const old = store.players().find(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (old) return res.json({ player: old });
    if (store.players().length >= 100) throw fail(409,'Casa tiene máximo 100 perfiles de jugador.');
    const p = { id: randomUUID(),name,createdAt: new Date().toISOString() }; store.addPlayer(p); res.status(201).json({ player: p });
  });
  router.post('/gaming/games',(req,res,next) => uploadFile(req,res,next,{ field: 'rom', limit: config.maxGameUploadBytes,
    extensions: [...new Set(gameSystems.flatMap(s => s.extensions))], save: async file => {
      const values = metadata.parse(req.body), extension = await validateGame(file,values.system);
      const hash = createHash('sha256'); for await (const chunk of createReadStream(file.path)) hash.update(chunk);
      const g = { id: randomUUID(), ...values, originalName: file.originalname, extension, size: file.size, createdAt: new Date().toISOString(), sha256: hash.digest('hex'), cover: null };
      const dest = romPath(g);
      try { await rename(file.path,dest); store.add(g); }
      catch (e) { await rm(dest,{ force: true }); throw e; }
      res.status(201).json({ game: publicGame(g) });
    } }));
  router.patch('/gaming/games/:id',(req,res) => {
    const g = game(req.params.id), v = z.object({ title: label, region }).strict().parse(req.body);
    store.edit(g.id,v.title,v.region); res.json({ game: publicGame(store.get(g.id)) });
  });
  router.get('/gaming/games/:id/rom/:name',(req,res,next) => {
    const g = game(req.params.id);
    if (req.params.name !== `game${g.extension}`) throw fail(404,'Archivo no encontrado.');
    send(res,romPath(g),'application/octet-stream',next);
  });
  router.get('/gaming/games/:id/download',(req,res,next) => {
    const g = game(req.params.id); res.download(romPath(g),g.originalName,e => { if (e) next(e); });
  });
  router.post('/gaming/games/:id/cover',(req,res,next) => {
    const g = game(req.params.id);
    return uploadFile(req,res,next,{ field: 'cover',limit: 4*1024**2, extensions: ['.jpg','.jpeg','.png'],save: async file => {
      const b = await readFile(file.path), png = b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
      if (!png && !b.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) throw fail(415,'Portada debe ser imagen PNG o JPG válida.');
      const cover = randomUUID(), dest = path.join(config.gameCovers,`${cover}.jpg`);
      try {
        await run(ffmpegPath,['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe',
          '-f','image2pipe','-c:v',png ? 'png' : 'mjpeg','-i',file.path,'-frames:v','1','-vf','scale=600:800:force_original_aspect_ratio=decrease','-q:v','3',dest],{ timeout: 15000 });
        game(g.id); store.cover(g.id,cover);
      } catch (e) { await rm(dest,{ force: true }); if (e.publicStatus) throw e; throw fail(415,'No pudimos leer portada. Usa otra imagen.'); }
      if (g.cover) await rm(path.join(config.gameCovers,`${g.cover}.jpg`),{ force: true }).catch(() => {});
      res.json({ game: publicGame(store.get(g.id)) });
    } });
  });
  router.get('/gaming/games/:id/cover',(req,res,next) => {
    const g = game(req.params.id); if (!g.cover) return res.status(404).end(); send(res,path.join(config.gameCovers,`${g.cover}.jpg`),'image/jpeg',next);
  });
  router.post('/gaming/bios',(req,res,next) => uploadFile(req,res,next,{ field: 'bios', limit: 1024**2,extensions: ['.bin'],save: async file => {
    const values = await validateBios(file.path), blob = `${randomUUID()}.bin`, dest = path.join(config.gameBios,blob);
    const old = store.bios().find(b => b.region === values.region);
    try { await rename(file.path,dest); store.setBios({ ...values,blob }); }
    catch (e) { await rm(dest,{ force: true }); throw e; }
    if (old) await rm(path.join(config.gameBios,old.blob),{ force: true }).catch(() => {}); res.status(201).json({ bios: values });
  } }));
  router.get('/gaming/bios/:region/:name',(req,res,next) => {
    const b = store.bios().find(b => b.region === req.params.region && b.filename === req.params.name);
    if (!b) throw fail(404,'BIOS no encontrada.'); send(res,path.join(config.gameBios,b.blob),'application/octet-stream',next);
  });
  router.get('/gaming/games/:id/play/:player',(req,res) => {
    const g = game(req.params.id), p = player(req.params.player);
    const bios = g.system === 'psx' ? store.bios().find(b => b.region === g.region) || store.bios().find(b => b.region === 'us') || store.bios()[0] : null;
    res.json({ game: publicGame(g), player: p, core: gameSystems.find(s => s.id === g.system).core,
      biosUrl: bios ? `/api/gaming/bios/${bios.region}/${bios.filename}` : null,
      saves: Object.fromEntries(['state','sram'].map(k => { const s = store.save(g.id,p.id,k); return [k,s ? { revision: s.revision,updatedAt: s.updatedAt } : null]; })) });
  });
  router.get('/gaming/games/:id/saves/:player/:kind',(req,res,next) => {
    const g = game(req.params.id), p = player(req.params.player), k = kind(req.params.kind), s = store.save(g.id,p.id,k);
    if (!s) return res.status(404).json({ error: 'Todavía no tienes partida guardada.' });
    res.setHeader('ETag',`"${s.revision}"`); send(res,path.join(config.gameSaves,s.blob),'application/octet-stream',next);
  });
  router.put('/gaming/games/:id/saves/:player/:kind', (req,res,next) => {
    try { game(req.params.id); player(req.params.player); kind(req.params.kind); } catch(e) { return next(e); }
    if (!req.is('application/octet-stream')) return res.status(415).json({ error: 'Guardado requiere contenido binario.' });
    if (uploading >= 2) return res.status(429).json({ error: 'Servidor ocupado. Reintenta guardado.' });
    uploading++; let released = false;
    const release = () => { if (!released) { released = true; uploading--; } }; res.once('finish',release); res.once('close',release);
    raw({ type: 'application/octet-stream',limit: maxSave })(req,res,next);
  },async (req,res) => {
    const g = game(req.params.id), p = player(req.params.player), k = kind(req.params.kind);
    const match = /^"(\d+)"$/.exec(req.headers['if-match'] || '');
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw fail(428,'Guardado requiere revisión de partida. Vuelve a abrir juego.');
    if (!Buffer.isBuffer(req.body) || !req.body.length || (k === 'sram' && req.body.length > 2*1024**2)) throw fail(400,'Guardado vacío o tamaño inválido.');
    const expected = Number(match[1]), old = store.save(g.id,p.id,k);
    if ((old?.revision || 0) !== expected) throw fail(409,'Partida cambió desde otro dispositivo. Descarga tu progreso y vuelve a abrir juego.');
    const disk = await statfs(config.dataDir); if (disk.bavail*disk.bsize < req.body.length+10*1024**2) throw fail(507,'Falta espacio para guardar partida.');
    const blob = `${randomUUID()}.sav`, dest = path.join(config.gameSaves,blob);
    try {
      await writeFile(dest,req.body,{ flag: 'wx' }); game(g.id); player(p.id);
      if (!store.setSave({ gameId: g.id,playerId: p.id,kind: k,blob,size: req.body.length,updatedAt: new Date().toISOString() },expected)) throw fail(409,'Partida cambió en otro dispositivo. Vuelve a abrir juego.');
    } catch (e) { await rm(dest,{ force: true }); throw e; }
    if (old) await rm(path.join(config.gameSaves,old.blob),{ force: true }).catch(() => {});
    res.json({ revision: expected+1,updatedAt: store.save(g.id,p.id,k).updatedAt });
  });
  router.delete('/gaming/games/:id',async (req,res) => {
    const g = game(req.params.id), saves = store.saves(g.id); store.remove(g.id);
    await rm(romPath(g),{ force: true });
    if (g.cover) await rm(path.join(config.gameCovers,`${g.cover}.jpg`),{ force: true });
    for (const s of saves) await rm(path.join(config.gameSaves,s.blob),{ force: true }); res.json({ ok: true });
  });
  return router;
}
