/* EmulatorJS 4.2.3 adapter. No game or BIOS data leaves this server. */
(() => {
  const params = new URLSearchParams(location.search), id = params.get('game'), profile = params.get('player');
  const valid = v => /^[a-f0-9-]{36}$/.test(v || '');
  let started = false, emulator, manifest, interval, restoring = true, stopped = false;
  const revisions = { state: 0,sram: 0 }, pending = { state: Promise.resolve(),sram: Promise.resolve() };
  const savedHashes = { sram: '' }; let conflict = false;
  const notify = (type,text) => { document.getElementById('message').textContent = text; parent.postMessage({ source: 'guarida-gaming',type,text },location.origin); };
  const base = `/api/gaming/games/${id}/saves/${profile}`;
  async function request(url,options) {
    const r = await fetch(url,options);
    if (!r.ok) { const b = await r.json().catch(() => ({})); throw Object.assign(new Error(b.error || 'No pudimos conectar con servidor.'),{ status: r.status }); }
    return r;
  }
  const ready = () => { if (!started || !emulator?.gameManager) throw new Error('Espera a que comience juego.'); return emulator.gameManager; };
  function save(kind,data) {
    if (stopped || conflict || restoring || !(data instanceof Uint8Array) || !data.length) return Promise.resolve();
    const copy = new Uint8Array(data);
    pending[kind] = pending[kind].catch(() => {}).then(async () => {
      if (conflict) return;
      if (kind === 'sram') {
        const digest = await crypto.subtle?.digest('SHA-256',copy).catch(() => null);
        const hash = digest ? Array.from(new Uint8Array(digest),v => v.toString(16).padStart(2,'0')).join('') : '';
        if (hash && savedHashes.sram === hash) return;
        const r = await request(`${base}/${kind}`,{ method: 'PUT',headers: { 'Content-Type': 'application/octet-stream','If-Match': `"${revisions[kind]}"` },body: copy });
        revisions[kind] = (await r.json()).revision; savedHashes.sram = hash;
      } else {
        const r = await request(`${base}/${kind}`,{ method: 'PUT',headers: { 'Content-Type': 'application/octet-stream','If-Match': `"${revisions[kind]}"` },body: copy }); revisions[kind] = (await r.json()).revision;
      }
      if (kind === 'state') notify('saved','Punto de partida guardado en Windows.');
    }).catch(e => { if (e.status === 409) conflict = true; notify('error',`${e.message} Puedes exportar progreso antes de salir.`); throw e; });
    // Events do not await handlers. Retain rejected promise for explicit save/exit, avoid unhandled rejection.
    pending[kind].catch(() => {}); return pending[kind];
  }
  async function loadState() {
    const gm = ready(); const r = await request(`${base}/state`);
    revisions.state = Number(r.headers.get('ETag')?.replaceAll('"','')) || revisions.state;
    gm.loadState(new Uint8Array(await r.arrayBuffer())); notify('loaded','Punto de partida recuperado.');
  }
  function exportState() {
    const blob = new Blob([ready().getState()]), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${id}.state`; link.click(); setTimeout(() => URL.revokeObjectURL(url),30000);
  }
  async function commands(command) {
    try {
      if (started && ['save','exit'].includes(command) && (conflict || restoring)) throw new Error('Guardado detenido para proteger partida. Exporta progreso y usa Salir sin guardar.');
      if (command === 'save') { const gm = ready(); gm.saveSaveFiles(); await save('state',gm.getState()); }
      if (command === 'load') await loadState();
      if (command === 'export') exportState();
      if (command === 'controls') { ready(); emulator.controlMenu.style.display = ''; }
      if (command === 'pause') { ready(); emulator.togglePlaying(); notify('paused',emulator.paused ? 'Partida en pausa.' : ''); }
      if (command === 'exit') {
        if (started) { const gm = ready(); gm.saveSaveFiles(); await Promise.all([pending.sram,save('state',gm.getState())]); }
        stopped = true; clearInterval(interval); parent.postMessage({ source: 'guarida-gaming',type: 'exit' },location.origin);
      }
    } catch (e) { notify('error',e.message); }
  }
  addEventListener('message',e => { if (e.origin === location.origin && e.source === parent && e.data?.source === 'guarida-gaming') void commands(e.data.command); });
  addEventListener('pagehide',() => clearInterval(interval));
  addEventListener('error',() => notify('error','Motor no pudo iniciarse. Revisa archivo, memoria disponible y compatibilidad del navegador.'));
  async function boot() {
    if (!valid(id) || !valid(profile)) throw new Error('Escoge juego y perfil desde Gaming.');
    manifest = await (await request(`/api/gaming/games/${id}/play/${profile}`)).json();
    for (const k of ['state','sram']) revisions[k] = manifest.saves[k]?.revision || 0;
    window.EJS_player = '#game'; window.EJS_core = manifest.core; window.EJS_pathtodata = '/emulatorjs/data/';
    // Stable UUID prevents names and profiles from sharing browser memory cards.
    window.EJS_gameName = `${id}-${profile}`; window.EJS_gameUrl = manifest.game.romUrl;
    window.EJS_biosUrl = manifest.biosUrl || ''; window.EJS_language = 'es-ES';
    window.EJS_threads = false; window.EJS_color = '#e4a98d'; window.EJS_startOnLoaded = false;
    window.EJS_startButtonName = 'Empezar partida'; window.EJS_backgroundColor = '#101211';
    window.EJS_disableDatabases = true; window.EJS_noAutoFocus = false;
    window.EJS_Buttons = { saveState: true,loadState: true,gamepad: true,saveSavFiles: true,loadSavFiles: false,
      netplay: false,screenRecord: false,cheat: false,cacheManager: false,quickSave: false,quickLoad: false };
    window.EJS_onSaveState = e => { void save('state',e.state); };
    window.EJS_onLoadState = () => { void loadState().catch(e => notify('error',e.message)); };
    window.EJS_ready = () => {
      emulator = window.EJS_emulator;
      emulator.on('saveSaveFiles',data => { void save('sram',data); });
      notify('ready',manifest.game.system === 'psx' && !manifest.biosUrl ? 'Sin BIOS: compatibilidad PS1 reducida. Pulsa Empezar partida.' : 'Pulsa Empezar partida. Conecta control a este dispositivo.');
    };
    window.EJS_onGameStart = async () => {
      started = true; restoring = true;
      try {
        if (revisions.sram) {
          const r = await request(`${base}/sram`); const gm = ready(), file = gm.getSaveFilePath();
          if (!file || !file.startsWith('/') || file.includes('..')) throw new Error('Motor no ofrece memory card compatible.');
          const parts = file.split('/').slice(1,-1); let dir = '';
          for (const part of parts) { dir += `/${part}`; if (!gm.FS.analyzePath(dir).exists) gm.FS.mkdir(dir); }
          gm.FS.writeFile(file,new Uint8Array(await r.arrayBuffer())); gm.loadSaveFiles();
        }
        if (params.get('resume') === '1' && revisions.state) await loadState();
        restoring = false; notify('started','');
        interval = setInterval(() => { if (!stopped && !conflict) { try { ready().saveSaveFiles(); } catch {} } },15000);
      } catch (e) {
        // Never overwrite server memory card if restoring it failed.
        restoring = true; notify('started',''); notify('error',`No pudimos recuperar partida: ${e.message} Guardado automático detenido; exporta progreso si continúas.`);
      }
    };
    const script = document.createElement('script'); script.src = '/emulatorjs/data/loader.js';
    script.onerror = () => notify('error','Motor no está instalado. Ejecuta npm run gaming:setup en servidor.'); document.body.appendChild(script);
  }
  void boot().catch(e => notify('error',e.message));
})();
