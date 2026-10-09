import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { request } from 'node:http';
import { createApplication } from '../server/app.mjs';
import { ffmpegPath } from '../server/media.mjs';
import { isLocalAddress } from '../server/network.mjs';

const exec = promisify(execFile);
let fixtureDir, mp4, mkv, avi;
before(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), 'casacine-fixtures-'));
  const create = async (name, videoCodec) => {
    const file = path.join(fixtureDir, name);
    await exec(ffmpegPath, ['-hide_banner','-loglevel','error','-y',
      '-f','lavfi','-i','testsrc=size=160x90:rate=10',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
      '-t','1.2','-c:v',videoCodec,'-pix_fmt','yuv420p','-c:a','aac',file]);
    return readFile(file);
  };
  mp4 = await create('sample.mp4','libx264');
  mkv = await create('sample.mkv','libx264');
  avi = await create('sample.avi','mpeg4');
});
after(async () => { await rm(fixtureDir, { recursive: true, force: true }); });

async function server(options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'casacine-server-'));
  const instance = await createApplication({ dataDir, houseCode: '', maxUploadBytes: 1024 ** 2, ...options });
  const http = instance.app.listen(0, '127.0.0.1'); await once(http,'listening');
  const base = `http://127.0.0.1:${http.address().port}`;
  return { ...instance, http, base, dataDir,
    async close(remove = true) {
      http.close(); http.closeAllConnections(); await instance.close();
      if (remove) await rm(dataDir, { recursive: true, force: true });
    } };
}
function form(content, filename = 'sample.mp4', overrides = {}) {
  const data = new FormData();
  const metadata = { title:'Viaje familiar',category:'Recuerdos',addedBy:'Sala',description:'Nuestra historia',...overrides };
  for (const [key,value] of Object.entries(metadata)) data.append(key,value);
  data.append('video',new Blob([content], { type: filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream' }),filename);
  return data;
}
const json = body => ({ headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
function rawStatus(url, headers) {
  return new Promise((resolve,reject) => {
    const req = request(url,{headers},res => { res.resume(); res.on('end',() => resolve(res.statusCode)); });
    req.on('error',reject); req.end();
  });
}

test('subida real, miniatura, Range, edición, descarga y eliminación', async () => {
  const s = await server();
  try {
    const upload = await fetch(`${s.base}/api/media`,{method:'POST',body:form(mp4)});
    assert.equal(upload.status,201);
    const { media } = await upload.json(); assert.equal(media.status,'processing');
    assert.equal(media.title,'Viaje familiar'); assert.ok(media.duration > 0); assert.ok(!('extension' in media));
    await s.queue.idle();
    const ready = (await (await fetch(`${s.base}/api/media/${media.id}`)).json()).media;
    assert.equal(ready.status,'ready'); assert.ok(ready.posterUrl);
    const range = await fetch(`${s.base}${ready.streamUrl}`,{headers:{Range:'bytes=10-29'}});
    assert.equal(range.status,206); assert.equal(range.headers.get('content-range'),`bytes 10-29/${mp4.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()),mp4.subarray(10,30));
    const invalidRange = await fetch(`${s.base}${ready.streamUrl}`,{headers:{Range:`bytes=${mp4.length + 100}-`}});
    assert.equal(invalidRange.status,416);
    const head = await fetch(`${s.base}${ready.streamUrl}`,{method:'HEAD'}); assert.equal(head.status,200);
    assert.equal(Number(head.headers.get('content-length')),mp4.length);
    const poster = await fetch(`${s.base}${ready.posterUrl}`); assert.equal(poster.status,200); assert.match(poster.headers.get('content-type'),/image\/jpeg/);
    const edit = await fetch(`${s.base}/api/media/${media.id}`,{method:'PATCH',...json({title:"Historia de Andrés: 'cine'",category:'En familia',addedBy:'Sala',description:'Sin HTML <script> x </script>'})});
    assert.equal(edit.status,200); assert.equal((await edit.json()).media.category,'En familia');
    const download = await fetch(`${s.base}${ready.downloadUrl}`); assert.deepEqual(Buffer.from(await download.arrayBuffer()),mp4);
    const remove = await fetch(`${s.base}/api/media/${media.id}`,{method:'DELETE'}); assert.equal(remove.status,200);
    assert.equal((await (await fetch(`${s.base}/api/media`)).json()).media.length,0);
    assert.deepEqual(await readdir(s.config.originals),[]);
    assert.equal((await fetch(`${s.base}/api/media/${media.id}/stream`)).status,404);
  } finally { await s.close(); }
});

test('MKV H.264 se empaqueta y AVI MPEG4 se convierte a MP4 reproducible', async () => {
  const s = await server();
  try {
    const responses = await Promise.all([fetch(`${s.base}/api/media`,{method:'POST',body:form(mkv,'family.mkv')}),fetch(`${s.base}/api/media`,{method:'POST',body:form(avi,'holiday.avi')})]);
    assert.deepEqual(responses.map(r => r.status),[201,201]);
    await s.queue.idle();
    const items = (await (await fetch(`${s.base}/api/media`)).json()).media;
    assert.equal(items.length,2);
    for (const item of items) {
      assert.equal(item.status,'ready'); assert.equal(item.progress,100);
      assert.equal(s.store.get(item.id).playable,'prepared');
      const response = await fetch(`${s.base}${item.streamUrl}`,{headers:{Range:'bytes=0-63'}});
      assert.equal(response.status,206); assert.equal((await response.arrayBuffer()).byteLength,64);
    }
    assert.equal((await readdir(s.config.prepared)).length,2);
  } finally { await s.close(); }
});

test('rechaza archivos falsos, extensiones, metadatos inválidos y exceso de tamaño; limpia temporales', async () => {
  const s = await server();
  try {
    const attempts = [
      [form(Buffer.from('not a video'),'fake.mp4'),415],
      [form(Buffer.from(`#EXTM3U\n#EXTINF:1.2,\n${path.join(fixtureDir,'sample.mp4')}\n`),'playlist.mp4'),415],
      [form(mp4,'malware.exe'),415],
      [form(mp4,'sample.mp4',{title:''}),400],
      [form(mp4,'sample.mp4',{category:'Privado'}),400],
      [form(Buffer.alloc(2*1024**2),'oversized.mp4'),413],
    ];
    for (const [body,status] of attempts) {
      const response = await fetch(`${s.base}/api/media`,{method:'POST',body});
      assert.equal(response.status,status);
      const result = await response.json(); assert.ok(!JSON.stringify(result).includes(s.dataDir));
    }
    assert.equal(s.store.list().length,0); assert.deepEqual(await readdir(s.config.scratch),[]);
    const response = await fetch(`${s.base}/api/media/..%2F..%2Fetc/stream`); assert.equal(response.status,400);
  } finally { await s.close(); }
});

test('código de casa protege videos, limita intentos y cookie permite reproducción', async () => {
  const s = await server({houseCode:'testing-only-phrase'});
  try {
    assert.equal((await fetch(`${s.base}/api/media`)).status,401);
    assert.equal((await (await fetch(`${s.base}/api/session`)).json()).authenticated,false);
    assert.equal((await fetch(`${s.base}/api/session`,{method:'POST',...json({code:'wrong'})})).status,401);
    const login = await fetch(`${s.base}/api/session`,{method:'POST',...json({code:'testing-only-phrase'})});
    assert.equal(login.status,200); const cookie = login.headers.get('set-cookie');
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
    assert.equal((await fetch(`${s.base}/api/media`,{headers:{Cookie:cookie}})).status,200);
    const tampered = cookie.replace(/(\.[a-f0-9]{63})([a-f0-9]);/,(_match,prefix,last) => `${prefix}${last === '0' ? '1' : '0'};`);
    assert.notEqual(tampered,cookie);
    assert.equal((await fetch(`${s.base}/api/media`,{headers:{Cookie:tampered}})).status,401);
    for (let i=0;i<8;i++) assert.equal((await fetch(`${s.base}/api/session`,{method:'POST',...json({code:'bad'})})).status,401);
    assert.equal((await fetch(`${s.base}/api/session`,{method:'POST',...json({code:'bad'})})).status,429);
  } finally { await s.close(); }
});

test('bloquea rebinding, sitios externos y direcciones públicas', async () => {
  const s = await server();
  try {
    assert.equal(await rawStatus(`${s.base}/api/media`,{Host:'attacker.example'}),403);
    assert.equal((await fetch(`${s.base}/api/media`,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    assert.equal((await fetch(`${s.base}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},body:'{"code":""}'})).status,403);
    for (const ip of ['192.168.1.4','10.0.0.8','172.16.0.1','127.0.0.1','::1','::ffff:192.168.1.1','fd12::1']) assert.equal(isLocalAddress(ip),true);
    for (const ip of ['8.8.8.8','172.15.1.1','172.32.0.1','2001:4860:4860::8888','fc-malformed','192.168.bad.1']) assert.equal(isLocalAddress(ip),false);
  } finally { await s.close(); }
});

test('catálogo y videos sobreviven reinicio del servidor', async () => {
  const first = await server();
  const upload = await fetch(`${first.base}/api/media`,{method:'POST',body:form(mp4)});
  const id = (await upload.json()).media.id; await first.queue.idle();
  await first.close(false);
  const second = await createApplication({dataDir:first.dataDir,houseCode:''});
  try { assert.equal(second.store.get(id).title,'Viaje familiar'); assert.equal(second.store.get(id).status,'ready'); }
  finally { await second.close(); await rm(first.dataDir,{recursive:true,force:true}); }
});
