import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { publicMedia } from './store.mjs';
import { movieTitleHint, normalizedMovieTitle } from '../shared/movie-title.mjs';

const fail = (status,message) => Object.assign(new Error('MOVIE_METADATA_FAILED'),{ publicStatus: status,publicMessage: message });
const imagePath = z.string().regex(/^\/[a-zA-Z0-9]+\.jpg$/).max(160);
const movieType = z.enum(['movie','tv']);
const clean = (v,max) => String(v || '').replace(/[\x00-\x1f]/g,'').trim().slice(0,max);
export function searchTitle(title) {
  return movieTitleHint(title).title;
}

export function createMovieMetadataRouter(config,store,queue) {
  const router = Router(), cache = new Map(), previews = new Map(); let active = 0,previewWaiting = 0,previewQueue = Promise.resolve();
  let stopped = false,timer,background = Promise.resolve(),backgroundBusy = false;
  function configured() { if (!config.tmdbToken && !config.tmdbKey) throw fail(503,'Configura TMDB_READ_ACCESS_TOKEN o TMDB_API_KEY en .env de Windows y reinicia servidor.'); }
  function media(id) { const m = store.get(z.uuid().parse(id)); if (!m) throw fail(404,'Video no encontrado.'); return m; }
  async function limited(task) {
    configured(); if (active >= 2) throw fail(429,'Hay búsquedas de películas en curso. Intenta en un momento.');
    active++; try { return await task(); } finally { active--; }
  }
  async function bounded(url,max,token = false) {
    let response;
    try { response = await fetch(url,{ headers: token && config.tmdbToken ? { Authorization: `Bearer ${config.tmdbToken}`,Accept: 'application/json' } : {}, redirect: 'error',signal: AbortSignal.timeout(15000) }); }
    catch { throw fail(502,'No pudimos conectar con TMDb. Video y carátula local siguen disponibles.'); }
    if (!response.ok) { await response.body?.cancel(); throw fail(response.status === 401 || response.status === 403 ? 503 : 502,
      response.status === 401 || response.status === 403 ? 'TMDb rechazó token. Revisa configuración en Windows.' : 'TMDb no respondió. Intenta más tarde.'); }
    if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw fail(502,'Respuesta de TMDb demasiado grande.'); }
    const chunks = []; let size = 0;
    try { for await (const b of response.body) { size += b.length; if (size > max) throw fail(502,'Respuesta de TMDb demasiado grande.'); chunks.push(b); } }
    catch(e) { if (e.publicStatus) throw e; throw fail(502,'Descarga de TMDb interrumpida.'); }
    return Buffer.concat(chunks);
  }
  async function json(endpoint,params = {}) {
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`); url.search = new URLSearchParams({ language: 'es-ES',...params,...(!config.tmdbToken && config.tmdbKey ? { api_key: config.tmdbKey } : {}) }).toString();
    try { return JSON.parse((await bounded(url,2*1024**2,true)).toString('utf8')); }
    catch(e) { if (e.publicStatus) throw e; throw fail(502,'Respuesta TMDb inválida.'); }
  }
  async function image(p,size) {
    const filename = imagePath.parse(p), b = await bounded(`https://image.tmdb.org/t/p/${size}${filename}`,5*1024**2);
    if (!b.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) throw fail(502,'TMDb no devolvió imagen JPEG válida.'); return b;
  }
  async function saveArtwork(m,v,choice = 'manual') {
    const output = await limited(async () => {
      const detail = await json(`${v.type}/${v.id}`);
      if (detail.id !== v.id) throw fail(502,'Ficha TMDb inválida.');
      const poster = detail.poster_path ? await image(detail.poster_path,'w500') : null;
      const backdrop = detail.backdrop_path ? await image(detail.backdrop_path,'w1280') : null;
      if (!poster) throw fail(404,'Esta ficha todavía no tiene carátula. Escoge otra ficha o conserva imagen de video.');
      return { detail,poster,backdrop };
    });
    const poster = `${randomUUID()}.jpg`, backdrop = output.backdrop ? `${randomUUID()}.jpg` : null;
    try {
      if (stopped) return;
      await writeFile(path.join(config.posters,poster),output.poster,{ flag: 'wx' });
      if (backdrop) await writeFile(path.join(config.posters,backdrop),output.backdrop,{ flag: 'wx' });
      const current = media(m.id);
      // A choice made while downloading wins over an older request.
      if (stopped || queue.isBusy(m.id) || current.posterVersion !== m.posterVersion || current.title !== m.title || current.category !== m.category ||
        (choice === 'auto' && (current.tmdbId || current.artworkChoice !== 'auto'))) throw fail(409,'Ficha cambió durante búsqueda. Intenta después.');
      store.artwork(m.id,{ poster,backdrop,tmdbId: v.id,tmdbType: v.type,choice,
        releaseYear: clean(output.detail.release_date || output.detail.first_air_date,10).slice(0,4),genres: (Array.isArray(output.detail.genres) ? output.detail.genres : []).slice(0,20).map(g => clean(g.name,80)),
        title: clean(output.detail.title || output.detail.name,160) || current.title,description: clean(output.detail.overview,2000) || current.description });
      for (const old of [current.artworkPoster,current.artworkBackdrop].filter(Boolean)) await rm(path.join(config.posters,old),{ force: true }).catch(() => {});
    } catch(e) { for (const f of [poster,backdrop].filter(Boolean)) await rm(path.join(config.posters,f),{ force: true }); throw e; }
  }
  async function automatic() {
    if (stopped || backgroundBusy || active >= 2 || (!config.tmdbToken && !config.tmdbKey)) return;
    const candidate = store.list().map(m => {
      const hint = movieTitleHint(m.title), type = m.category === 'Series' ? 'tv' : 'movie';
      return { m,hint,type,key: JSON.stringify({ ...hint,type }) };
    }).find(({m,hint,key}) => m.status === 'ready' && !queue.isBusy(m.id) && !m.tmdbId && m.artworkChoice === 'auto' &&
      ['Películas','Series'].includes(m.category) && hint.title && (m.artworkLookupKey !== key || Date.now()-m.artworkLookupAt > 24*60*60000));
    if (!candidate) return;
    backgroundBusy = true;
    const {m,hint,type,key} = candidate;
    store.artworkAttempt(m.id,key);
    try {
      const result = await limited(() => json(`search/${type}`,{ query: hint.title,include_adult: 'false',
        ...(hint.year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: hint.year } : {}) }));
      const exact = (Array.isArray(result.results) ? result.results : []).filter(r => Number.isSafeInteger(r.id) && r.id > 0 &&
        [r.title || r.name,r.original_title || r.original_name].some(t => normalizedMovieTitle(t) === normalizedMovieTitle(hint.title)) &&
        (!hint.year || String(r.release_date || r.first_air_date || '').slice(0,4) === hint.year));
      if (!stopped && exact.length === 1 && imagePath.safeParse(exact[0].poster_path).success) await saveArtwork(m,{ id: exact[0].id,type },'auto');
    } catch {
      // Network failures retry in five minutes; uncertain matches wait a day.
      if (!stopped) store.artworkAttempt(m.id,key,Date.now()-24*60*60000+5*60000);
    }
    finally { backgroundBusy = false; }
  }
  router.startMetadata = () => {
    const tick = () => { if (!backgroundBusy && !stopped) background = automatic(); };
    timer = setInterval(tick,5000); timer.unref(); tick();
  };
  router.closeMetadata = async () => { stopped = true; clearInterval(timer); await background; };
  router.get('/metadata/config',(_req,res) => res.json({ provider: 'TMDb',configured: Boolean(config.tmdbToken || config.tmdbKey),credits: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' }));
  router.post('/media/:id/identify',async (req,res) => {
    const m = media(req.params.id), query = z.object({ query: z.string().trim().min(1).max(160).optional(),type: movieType.optional(),year: z.string().regex(/^\d{4}$/).optional() }).strict().parse(req.body);
    const hint = movieTitleHint(query.query || m.title), title = hint.title, type = query.type || (m.category === 'Series' ? 'tv' : 'movie');
    query.year ||= hint.year;
    if (!title) throw fail(400,'Escribe título de película o serie.');
    const key = JSON.stringify({ title,type,year: query.year });
    const old = cache.get(key);
    if (old && old.until > Date.now()) return res.json(old.value);
    const result = await limited(() => json(`search/${type}`,{ query: title,include_adult: 'false',...(query.year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: query.year } : {}) }));
    if (!Array.isArray(result.results)) throw fail(502,'Resultados TMDb inválidos.');
    const value = { query: title,type,results: result.results.slice(0,12).filter(r => Number.isSafeInteger(r.id) && r.id > 0).map(r => {
      const poster = imagePath.safeParse(r.poster_path);
      return { id: r.id,type,title: clean(r.title || r.name,160),originalTitle: clean(r.original_title || r.original_name,160),year: clean(r.release_date || r.first_air_date,10).slice(0,4),overview: clean(r.overview,2000),
        posterUrl: poster.success ? `/api/metadata/image?path=${encodeURIComponent(poster.data)}` : null };
    }) };
    if (cache.size >= 100) cache.delete(cache.keys().next().value); cache.set(key,{ until: Date.now()+10*60000,value }); res.json(value);
  });
  router.get('/metadata/image',async (req,res) => {
    configured(); const p = imagePath.parse(req.query.path), old = previews.get(p);
    if (old) return res.type('image/jpeg').send(old);
    if (previewWaiting >= 24) throw fail(429,'Hay muchas portadas cargando. Intenta otra búsqueda.');
    previewWaiting++;
    const work = previewQueue.catch(() => {}).then(async () => {
      if (previews.has(p)) return previews.get(p);
      const b = await image(p,'w185');
      while (previews.size && [...previews.values()].reduce((sum,v) => sum+v.length,0)+b.length > 20*1024**2) previews.delete(previews.keys().next().value);
      previews.set(p,b); return b;
    });
    previewQueue = work.then(() => {}).catch(() => {});
    try { res.type('image/jpeg').send(await work); } finally { previewWaiting--; }
  });
  router.post('/media/:id/artwork',async (req,res) => {
    const m = media(req.params.id), v = z.object({ id: z.number().int().positive().max(2147483647),type: movieType }).strict().parse(req.body);
    if (m.status !== 'ready' || queue.isBusy(m.id)) throw fail(409,'Espera a que termine preparación de video.');
    await saveArtwork(m,v);
    res.json({ media: publicMedia(store.get(m.id)) });
  });
  router.delete('/media/:id/artwork',async (req,res) => {
    const m = media(req.params.id); store.clearArtwork(m.id);
    for (const old of [m.artworkPoster,m.artworkBackdrop].filter(Boolean)) await rm(path.join(config.posters,old),{ force: true }); res.json({ media: publicMedia(store.get(m.id)) });
  });
  return router;
}
