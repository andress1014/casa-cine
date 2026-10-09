import { mkdir, readFile, writeFile, rm, rename, cp, mkdtemp, access } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version = '4.2.3', checksum = '07d451bc06fa3ad04ab30d9b94eb63ac34ad0babee52d60357b002bde8f3850b';
const dest = path.join(root,'vendor/emulatorjs',version);
const files = ['LICENSE','data/loader.js','data/emulator.min.js','data/emulator.min.css','data/version.json',
  'data/compression/extractzip.js','data/compression/extract7z.js','data/compression/libunrar.js','data/compression/libunrar.wasm',
  'data/localization/es-ES.json','data/localization/en-US.json','data/localization/retroarch.json',
  ...['pcsx_rearmed','snes9x'].flatMap(core => [`data/cores/reports/${core}.json`,`data/cores/${core}-wasm.data`,`data/cores/${core}-legacy-wasm.data`])];
async function hash(file) { const h = createHash('sha256'); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); }
async function installed() {
  try {
    const m = JSON.parse(await readFile(path.join(dest,'installed.json'),'utf8'));
    if (m.version !== version || m.archiveSha256 !== checksum) return false;
    for (const f of files) if (await hash(path.join(dest,f)) !== m.files[f]) return false;
    return true;
  } catch { return false; }
}
if (await installed()) { console.log(`Gaming: EmulatorJS ${version} preparado para PS1 y SNES.`); process.exit(0); }
const temp = await mkdtemp(path.join(tmpdir(),'guarida-emulator-'));
try {
  const archive = process.env.EMULATORJS_ARCHIVE ? path.resolve(process.env.EMULATORJS_ARCHIVE) : path.join(temp,'emulator.7z');
  if (!process.env.EMULATORJS_ARCHIVE) {
    console.log(`Gaming: descargando EmulatorJS ${version} oficial (290 MB, primera instalación).`);
    const response = await fetch(`https://github.com/EmulatorJS/EmulatorJS/releases/download/v${version}/${version}.7z`,{ signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error('Descarga de motor no disponible.');
    await pipeline(Readable.fromWeb(response.body),createWriteStream(archive,{ flags: 'wx' }));
  }
  if (await hash(archive) !== checksum) throw new Error('Checksum de EmulatorJS no coincide. Vuelve a descargar archivo oficial.');
  const unpacked = path.join(temp,'unpacked'); await mkdir(unpacked);
  await promisify(execFile)(process.env.TAR_BIN || 'tar',['-xf',archive,'-C',unpacked,...files],{ timeout: 180000,windowsHide: true,maxBuffer: 1024**2 });
  const manifest = { version,archiveSha256: checksum,files: {} };
  for (const f of files) { await access(path.join(unpacked,f)); manifest.files[f] = await hash(path.join(unpacked,f)); }
  await writeFile(path.join(unpacked,'installed.json'),JSON.stringify(manifest,null,2)+'\n');
  await mkdir(path.dirname(dest),{ recursive: true }); await rm(dest,{ recursive: true,force: true });
  try { await rename(unpacked,dest); } catch(e) { if (e.code !== 'EXDEV') throw e; await cp(unpacked,dest,{ recursive: true }); }
  console.log('Gaming preparado. Juegos y BIOS se añaden desde Guarida.');
} catch (e) {
  console.error(`No pudimos preparar Gaming: ${e.message}\nWindows requiere tar.exe (Windows 10/11 actualizado). Consulta docs/GAMING.md.`); process.exitCode = 1;
} finally { await rm(temp,{ recursive: true,force: true }); }
