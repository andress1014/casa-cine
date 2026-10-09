import { networkInterfaces, hostname, userInfo } from 'node:os';
import { isIP } from 'node:net';
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';

export function isLocalAddress(address = '') {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 127 || a === 10 || (a === 192 && b === 168)
      || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  return ip === '::1' || (isIP(ip.split('%')[0]) === 6 && /^(fc|fd|fe[89ab])/.test(ip));
}

export function localUrls(port) {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(Boolean)
    .filter(i => i.family === 'IPv4' && !i.internal && isLocalAddress(i.address))
    .map(i => `http://${i.address}:${port}`))];
}

// Browser clients cannot read their OS account. Only reveal this computer's account to this computer.
export function localIdentity(remoteAddress = '') {
  const address = remoteAddress.toLowerCase().replace(/^::ffff:/, '');
  const addresses = Object.values(networkInterfaces()).flat().filter(Boolean).map(i => i.address.toLowerCase());
  if (address !== '::1' && !address.startsWith('127.') && !addresses.includes(address)) return null;
  try { return userInfo().username.trim().replace(/[\x00-\x1f]/g, '').slice(0, 60) || null; }
  catch { return null; }
}

export function localOnly(req, res, next) {
  if (!isLocalAddress(req.socket.remoteAddress)) return res.status(403).json({ error: 'Guarida funciona dentro de tu red local.' });
  let host;
  try { host = new URL(`http://${req.headers.host}`).hostname.replace(/^\[|\]$/g, ''); }
  catch { return res.status(400).json({ error: 'Dirección inválida.' }); }
  const computer = hostname().toLowerCase();
  if (!isLocalAddress(host) && !['localhost', computer, `${computer}.local`].includes(host.toLowerCase())) {
    return res.status(403).json({ error: 'Usa la dirección local de Guarida.' });
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Abre Guarida directamente desde tu red.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      return res.status(403).json({ error: 'Origen no permitido.' });
    }
  }
  next();
}

export function createAccess(houseCode) {
  const signingKey = randomBytes(32);
  const failures = new Map();
  const hash = text => createHash('sha256').update(text).digest();
  const sign = text => createHmac('sha256', signingKey).update(text).digest('hex');
  function authenticated(req) {
    if (!houseCode) return true;
    const cookie = (req.headers.cookie || '').split(';').find(c => c.trim().startsWith('casacine='));
    if (!cookie) return false;
    const token = cookie.trim().slice(9);
    const [expiry, nonce, signature] = token.split('.');
    if (!expiry || !nonce || !signature || !/^\d{13}$/.test(expiry) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
    return Number(expiry) > Date.now() && timingSafeEqual(Buffer.from(sign(`${expiry}.${nonce}`), 'hex'), Buffer.from(signature, 'hex'));
  }
  return {
    required: Boolean(houseCode), authenticated,
    guard(req, res, next) { if (authenticated(req)) next(); else res.status(401).json({ error: 'Introduce el código de casa para entrar.' }); },
    login(req, res, code) {
      const ip = req.socket.remoteAddress;
      const now = Date.now();
      for (const [key, value] of failures) if (value.until < now) failures.delete(key);
      const attempts = failures.get(ip);
      if (attempts && attempts.count >= 8) return res.status(429).json({ error: 'Espera un minuto antes de volver a intentar.' });
      if (houseCode && !timingSafeEqual(hash(code), hash(houseCode))) {
        failures.set(ip, { count: (attempts?.count || 0) + 1, until: attempts?.until || now + 60_000 });
        return res.status(401).json({ error: 'Código incorrecto. Vuelve a intentar.' });
      }
      failures.delete(ip);
      const value = `${now + 30 * 86400_000}.${randomBytes(16).toString('hex')}`;
      res.setHeader('Set-Cookie', `casacine=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
      res.json({ authenticated: true });
    },
  };
}
