import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3210),
  HOST: z.enum(['0.0.0.0', '127.0.0.1', '::']).default('0.0.0.0'),
  MAX_UPLOAD_GB: z.coerce.number().min(0.001).max(500).default(30),
  MAX_FILE_UPLOAD_GB: z.coerce.number().min(0.001).max(500).default(2),
  MAX_GAME_UPLOAD_GB: z.coerce.number().min(0.001).max(1).default(1),
  TLS_PORT: z.coerce.number().int().min(1).max(65535).default(3443),
  TLS_CERT: z.string().default(''),
  TLS_KEY: z.string().default(''),
  TMDB_READ_ACCESS_TOKEN: z.string().trim().max(2048).refine(v => !/[\r\n]/.test(v)).default(''),
  TMDB_API_KEY: z.union([z.literal(''),z.string().regex(/^[a-f0-9]{32}$/)]).default(''),
  DATA_DIR: z.string().default(''),
  HOUSE_CODE: z.string().max(128).default(''),
});

export function makeConfig(overrides = {}) {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Configuración inválida. Revisa .env y .env.example.');
  const env = parsed.data;
  // Optional personal distribution config stays outside Git and never reaches browser.
  let personalKey = '';
  const personalFile = path.join(root,'personal-settings.json');
  if (existsSync(personalFile)) {
    try { personalKey = z.object({ tmdbApiKey: z.string().regex(/^[a-f0-9]{32}$/) }).strict().parse(JSON.parse(readFileSync(personalFile,'utf8'))).tmdbApiKey; }
    catch { throw new Error('Configuración personal inválida. Revisa personal-settings.json.'); }
  }
  const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data'));
  const config = {
    port: env.PORT, host: env.HOST, dataDir,
    maxUploadBytes: Math.floor(env.MAX_UPLOAD_GB * 1024 ** 3),
    maxFileUploadBytes: Math.floor(env.MAX_FILE_UPLOAD_GB * 1024 ** 3),
    maxGameUploadBytes: Math.floor(env.MAX_GAME_UPLOAD_GB * 1024 ** 3),
    tlsPort: env.TLS_PORT, tlsCert: env.TLS_CERT, tlsKey: env.TLS_KEY,
    tmdbToken: env.TMDB_READ_ACCESS_TOKEN, tmdbKey: env.TMDB_API_KEY || personalKey,
    houseCode: env.HOUSE_CODE, dev: false,
    ...overrides,
  };
  if (Boolean(config.tlsCert) !== Boolean(config.tlsKey)) throw new Error('HTTPS requiere TLS_CERT y TLS_KEY juntos.');
  if (config.tlsCert && config.tlsPort === config.port) throw new Error('HTTPS y HTTP requieren puertos diferentes.');
  for (const folder of ['originals', 'prepared', 'posters', 'scratch', 'documents', 'fileScratch', 'subtitles', 'games', 'gameScratch', 'gameCovers', 'gameBios', 'gameSaves']) {
    config[folder] = path.join(config.dataDir, folder);
    mkdirSync(config[folder], { recursive: true });
  }
  return config;
}
