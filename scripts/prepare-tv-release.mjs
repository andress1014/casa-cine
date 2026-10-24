import { readFile, writeFile, mkdir, copyFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tvManifestSchema } from '../server/tv-updates.mjs';

// Local packaging only. Never publishes a release or contacts GitHub.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function prepare() {
  const input = path.resolve(process.argv[2] || path.join(root,'android-tv/app/build/outputs/apk/debug/app-debug.apk'));
  const reference = path.resolve(process.argv[3] || path.join(root,'releases/Guarida-TV-v1.3.3.apk'));
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Define ANDROID_HOME con SDK instalado antes de preparar APK.');
  const versions = (await readdir(path.join(sdk,'build-tools'))).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort((a,b) => b.localeCompare(a,undefined,{ numeric: true }));
  if (!versions.length) throw new Error('Instala Android build-tools antes de preparar APK.');
  const tools = path.join(sdk,'build-tools',versions[0]);
  const signer = path.join(tools, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const aapt = path.join(tools, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const certs = file => [...execFileSync(signer,['verify','--print-certs',file],{ encoding:'utf8', maxBuffer:1024*1024 }).matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})/gi)]
    .map(match => match[1].toLowerCase()).sort().join(',');
  const original = certs(reference), actual = certs(input);
  if (!original || actual !== original) throw new Error('Firma distinta de APK anterior. Usa mismo keystore; no publiques esta APK como actualización.');
  const badging = execFileSync(aapt,['dump','badging',input],{ encoding:'utf8', maxBuffer:1024*1024 });
  const pkg = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  const minSdk = badging.match(/^sdkVersion:'(\d+)'/m);
  if (!pkg || !minSdk) throw new Error('No pudimos obtener identidad de APK.');
  const size = (await stat(input)).size;
  if (size > 128 * 1024 ** 2) throw new Error('APK supera límite del actualizador.');
  const manifest = tvManifestSchema.parse({ packageName:pkg[1], versionCode:Number(pkg[2]), versionName:pkg[3], minSdk:Number(minSdk[1]),
    apkName:`Guarida-TV-v${pkg[3]}.apk`, size, sha256:createHash('sha256').update(await readFile(input)).digest('hex') });
  const gradle = await readFile(path.join(root,'android-tv/app/build.gradle'),'utf8');
  if (Number(gradle.match(/versionCode\s+(\d+)/)?.[1]) !== manifest.versionCode || gradle.match(/versionName\s+'([^']+)'/)?.[1] !== manifest.versionName) throw new Error('APK no corresponde a versión actual del proyecto. Compila de nuevo.');
  await mkdir(path.join(root,'releases'),{ recursive:true });
  const apkPath = path.join(root,'releases',manifest.apkName);
  if (input !== apkPath) await copyFile(input,apkPath);
  await writeFile(path.join(root,'releases','tv-update.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Preparados ${manifest.apkName} y tv-update.json. Firma compatible con versión anterior. Sin publicar.`);
}
prepare().catch(() => { console.error('No se preparó release: revisa SDK, build, versión y mismo certificado de APK anterior.'); process.exitCode = 1; });
