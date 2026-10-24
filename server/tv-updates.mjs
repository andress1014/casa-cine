import express from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { once } from 'node:events';

export const tvManifestSchema = z.object({
  packageName: z.literal('com.andress1014.casacine.tv'),
  versionCode: z.number().int().positive().max(2100000000),
  versionName: z.string().regex(/^\d+\.\d+\.\d+$/).max(40),
  minSdk: z.number().int().min(23).max(100),
  apkName: z.string().regex(/^Guarida-TV-v\d+\.\d+\.\d+\.apk$/).max(100),
  size: z.number().int().min(1024).max(128 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(m => m.apkName === `Guarida-TV-v${m.versionName}.apk`);

const unavailable = () => Object.assign(new Error('TV_UPDATE_UNAVAILABLE'), {
  publicStatus: 503, publicMessage: 'No pudimos buscar actualización. Revisa conexión y configuración en PC.',
});
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const api = 'https://api.github.com';
const cdnHosts = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

// Only the configured repository can be queried. Credentials never follow CDN redirects.
async function github(config, endpoint, binary = false, signal) {
  let response = await fetch(`${api}/repos/${config.tvUpdateRepository}/${endpoint}`, {
    headers: { Authorization: `Bearer ${config.tvUpdateToken}`, Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' },
    redirect: 'manual', signal,
  });
  if (binary && response.status === 302) {
    const location = response.headers.get('location');
    await response.body?.cancel();
    let target;
    try { target = new URL(location); } catch { throw unavailable(); }
    if (target.protocol !== 'https:' || !cdnHosts.has(target.hostname) || target.port || target.username || target.password) throw unavailable();
    response = await fetch(target, { redirect: 'error', signal });
  }
  if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
  return response;
}
async function readJSON(response, limit) {
  let size = 0; const chunks = [];
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw unavailable();
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw unavailable(); }
}

export function createTvUpdatesRouter(config) {
  const router = express.Router();
  let cached = null, checkedAt = 0, attemptedAt = 0, pending = null, downloads = 0;
  const configured = Boolean(config.tvUpdateToken);
  const status = () => ({ configured, checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
    update: cached ? { ...cached.manifest, downloadPath: `/api/tv/update/apk/${cached.manifest.sha256}` } : null });
  async function check() {
    if (!configured) return status();
    if (pending) return pending;
    // One upstream check per 15 minutes, including failures; devices share the result.
    if (Date.now() - attemptedAt < 15 * 60_000) {
      if (attemptedAt !== checkedAt) throw unavailable();
      return status();
    }
    attemptedAt = Date.now(); const attempt = attemptedAt;
    pending = (async () => {
      const signal = AbortSignal.timeout(30_000);
      const release = await readJSON(await github(config, 'releases/latest', false, signal), 1024 * 1024);
      if (release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets)) throw unavailable();
      const manifests = release.assets.filter(a => a.name === 'tv-update.json');
      if (manifests.length === 0) { cached = null; checkedAt = attempt; return status(); }
      if (manifests.length !== 1) throw unavailable();
      const manifestID = integer.parse(manifests[0].id);
      const parsed = tvManifestSchema.safeParse(await readJSON(await github(config, `releases/assets/${manifestID}`, true, signal), 16 * 1024));
      if (!parsed.success) throw unavailable();
      const manifest = parsed.data;
      const apks = release.assets.filter(a => a.name === manifest.apkName);
      if (apks.length !== 1 || apks[0].size !== manifest.size || (apks[0].digest && apks[0].digest !== `sha256:${manifest.sha256}`)) throw unavailable();
      const assetID = integer.parse(apks[0].id);
      // Never offer downgrade when a release is republished out of order.
      if (cached && manifest.versionCode < cached.manifest.versionCode) throw unavailable();
      cached = { manifest, assetID }; checkedAt = attempt; return status();
    })().catch(() => { throw unavailable(); }).finally(() => { pending = null; });
    return pending;
  }
  router.use('/tv/update', (req, res, next) => {
    if (req.viaTunnel) return res.status(403).json({ error: 'Actualiza Guarida desde Wi-Fi de casa.' });
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Solicitud inválida.' });
    next();
  });
  router.get('/tv/update', (_req, res) => res.json(status()));
  router.post('/tv/update/check', async (req, res, next) => {
    if (!req.is('application/json') || !z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ error: 'Solicitud inválida.' });
    try { res.json(await check()); } catch { next(unavailable()); }
  });
  router.head('/tv/update/apk/:sha256', (req, res) => {
    if (!cached || !/^[a-f0-9]{64}$/.test(req.params.sha256) || req.params.sha256 !== cached.manifest.sha256) return res.status(409).end();
    res.type('application/vnd.android.package-archive').set('Content-Length',String(cached.manifest.size)).end();
  });
  router.get('/tv/update/apk/:sha256', async (req, res, next) => {
    const selected = cached;
    if (!/^[a-f0-9]{64}$/.test(req.params.sha256) || !selected || selected.manifest.sha256 !== req.params.sha256) {
      return res.status(409).json({ error: 'Busca versión disponible de nuevo antes de descargar.' });
    }
    if (downloads >= 2) return res.status(429).json({ error: 'Hay otra descarga en curso. Intenta en un momento.' });
    downloads++;
    const cancel = new AbortController();
    const close = () => cancel.abort(); res.once('close', close);
    try {
      const response = await github(config, `releases/assets/${selected.assetID}`, true, AbortSignal.any([cancel.signal, AbortSignal.timeout(180_000)]));
      const length = response.headers.get('content-length');
      if (length && Number(length) !== selected.manifest.size) { await response.body?.cancel(); throw unavailable(); }
      res.type('application/vnd.android.package-archive');
      res.setHeader('Content-Length', selected.manifest.size);
      res.setHeader('Content-Disposition', `attachment; filename="${selected.manifest.apkName}"`);
      const digest = createHash('sha256'); let size = 0, previous = null;
      // Keep final chunk until digest/length are verified, so corruption cannot complete.
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > selected.manifest.size) throw unavailable();
        digest.update(chunk);
        if (previous && !res.write(previous)) await once(res, 'drain', { signal: cancel.signal });
        previous = chunk;
      }
      if (size !== selected.manifest.size || digest.digest('hex') !== selected.manifest.sha256) throw unavailable();
      res.end(previous);
    } catch {
      if (res.destroyed) return;
      if (res.headersSent) res.destroy(); else { res.removeHeader('Content-Length'); res.removeHeader('Content-Disposition'); next(unavailable()); }
    } finally { downloads--; res.off('close', close); cancel.abort(); }
  });
  return router;
}
