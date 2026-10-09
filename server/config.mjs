import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3210),
  HOST: z.enum(['0.0.0.0', '127.0.0.1', '::']).default('0.0.0.0'),
  MAX_UPLOAD_GB: z.coerce.number().min(0.001).max(500).default(30),
  MAX_FILE_UPLOAD_GB: z.coerce.number().min(0.001).max(500).default(2),
  DATA_DIR: z.string().default(''),
  HOUSE_CODE: z.string().max(128).default(''),
});

export function makeConfig(overrides = {}) {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Configuración inválida. Revisa .env y .env.example.');
  const env = parsed.data;
  const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data'));
  const config = {
    port: env.PORT, host: env.HOST, dataDir,
    maxUploadBytes: Math.floor(env.MAX_UPLOAD_GB * 1024 ** 3),
    maxFileUploadBytes: Math.floor(env.MAX_FILE_UPLOAD_GB * 1024 ** 3),
    houseCode: env.HOUSE_CODE, dev: false,
    ...overrides,
  };
  for (const folder of ['originals', 'prepared', 'posters', 'scratch', 'documents', 'fileScratch', 'subtitles']) {
    config[folder] = path.join(config.dataDir, folder);
    mkdirSync(config[folder], { recursive: true });
  }
  return config;
}
