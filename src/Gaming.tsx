import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Gamepad2, UploadCloud, Play, Search, RefreshCw, Settings2, Plus, Save, Download, Pause, Maximize, X, LoaderCircle, Trash2, ShieldCheck, ImagePlus, ArrowUpRight } from 'lucide-react';
import { Dialog } from './Dialog';
import { api, bytes, readLocal, writeLocal } from './types';
import './gaming.css';

type Game = { id: string; title: string; system: 'psx' | 'snes'; region: string; originalName: string; extension: string; size: number; addedBy: string; createdAt: string; coverUrl: string | null; downloadUrl: string };
type Player = { id: string; name: string };
type Config = { emulatorVersion: string; emulatorReady: boolean; maxUploadBytes: number; systems: { id: string; name: string; extensions: string[]; maxBytes: number }[]; bios: { region: string; filename: string }[]; httpsUrls: string[] };
const systemName = (id: string) => id === 'psx' ? 'PlayStation 1' : 'Super Nintendo';
const regionName: Record<string,string> = { auto: 'Automática',us: 'América / NTSC',eu: 'Europa / PAL',jp: 'Japón / NTSC' };

function ControllerStatus() {
  const [controllers,setControllers] = useState<string[]>([]), [supported,setSupported] = useState(true);
  useEffect(() => {
    const update = () => {
      try { if (!navigator.getGamepads) { setSupported(false); return; } setControllers(Array.from(navigator.getGamepads()).filter(Boolean).map(g => g!.id)); }
      catch { setSupported(false); }
    };
    update(); const timer = setInterval(update,1500);
    addEventListener('gamepadconnected',update); addEventListener('gamepaddisconnected',update);
    return () => { clearInterval(timer); removeEventListener('gamepadconnected',update); removeEventListener('gamepaddisconnected',update); };
  },[]);
  return <div className={`gaming-controller ${controllers.length ? 'connected' : ''}`}><Gamepad2 size={20} /><span><strong>{controllers.length ? `${controllers.length} control${controllers.length > 1 ? 'es' : ''} conectado${controllers.length > 1 ? 's' : ''}` : !supported ? 'Navegador sin acceso a controles' : 'Tu control, tu partida'}</strong><small>{controllers.length ? controllers.join(' · ') : 'Conecta DualSense por USB/Bluetooth y pulsa botón para detectarlo.'}</small></span></div>;
}

export function Gaming({ name,notify,onChanged }: { name: string; notify: (text: string) => void; onChanged: () => void }) {
  const [games,setGames] = useState<Game[]>([]), [players,setPlayers] = useState<Player[]>([]), [config,setConfig] = useState<Config | null>(null);
  const [profile,setProfile] = useState(() => readLocal<string>('gaming-player',''));
  const [query,setQuery] = useState(''), [system,setSystem] = useState('all'), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [upload,setUpload] = useState(false), [bios,setBios] = useState(false), [newProfile,setNewProfile] = useState(false), [playing,setPlaying] = useState<Game | null>(null);
  const [editing,setEditing] = useState<Game | null>(null), [deleting,setDeleting] = useState<Game | null>(null), [busy,setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [library,users,settings] = await Promise.all([api<{ games: Game[] }>('/api/gaming/games'),api<{ players: Player[] }>('/api/gaming/players'),api<Config>('/api/gaming/config')]);
      setGames(library.games); setPlayers(users.players); setConfig(settings); setError('');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  },[]);
  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    if (!players.length || players.some(p => p.id === profile)) return;
    const p = players.find(p => p.name === name) || players[0]; setProfile(p.id); writeLocal('gaming-player',p.id);
  },[players,profile,name]);
  function changed() { void refresh(); onChanged(); }
  const visible = useMemo(() => games.filter(g => (system === 'all' || system === g.system) && `${g.title} ${g.addedBy}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[games,query,system]);
  const secureUrl = config?.httpsUrls.find(u => new URL(u).hostname === location.hostname) || config?.httpsUrls.find(u => new URL(u).hostname !== 'localhost');
  const validProfile = players.find(p => p.id === profile);
  function play(g: Game) {
    if (!config?.emulatorReady) { notify('Motor pendiente: ejecuta npm run gaming:setup en servidor.'); return; }
    if (!validProfile) { setNewProfile(true); return; } setPlaying(g);
  }
  async function remove() {
    if (!deleting || busy) return; setBusy(true);
    try { await api(`/api/gaming/games/${deleting.id}`,{ method: 'DELETE' }); setDeleting(null); changed(); notify('Juego y sus partidas eliminados.'); }
    catch(e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="gaming-library">
    <div className="gaming-welcome"><div><span className="section-eyebrow">OTRA VIDA, OTRA PARTIDA</span><h1>Tu casa tiene<br /><span>modo juego.</span></h1><p>Clásicos en tu estante. Control en tus manos.<br />Elige aventura y sigue donde la dejaste.</p></div><div className="gaming-art" aria-hidden="true"><span className="gaming-art-star">✳</span><Gamepad2 size={120} strokeWidth={1.25} /><span className="gaming-art-label">INSERTA BUEN PLAN</span><span className="gaming-art-button">✚</span></div></div>
    <div className="gaming-heading"><div><h2>Mi colección <span>{games.length}</span></h2><p>PlayStation 1 y Super Nintendo · dentro de casa</p></div><div className="gaming-actions"><button className="button secondary" onClick={() => setBios(true)}><ShieldCheck size={17} /> BIOS PS1</button><button className="button gaming-primary" onClick={() => setUpload(true)}><Plus size={18} /> Agregar juego</button></div></div>
    {error && <div className="connection-warning" role="alert">{error}<button onClick={() => void refresh()}>Reintentar</button></div>}
    {config && !config.emulatorReady && <div className="gaming-notice" role="status">Motor pendiente. Ejecuta <code>npm run gaming:setup</code> en Windows y pulsa actualizar.</div>}
    {!window.isSecureContext && <div className="gaming-notice">Para controles en este dispositivo necesitas HTTPS local con certificado de confianza.{secureUrl ? <a href={`${secureUrl}/gaming`}>Abrir Gaming con HTTPS <ArrowUpRight size={15} /></a> : <span>Configuración: guía docs/GAMING.md en proyecto. Teclado y controles táctiles siguen disponibles.</span>}</div>}
    <div className="gaming-tools"><ControllerStatus /><label className="gaming-profile">Jugador<select value={validProfile ? profile : ''} onChange={e => { setProfile(e.target.value); writeLocal('gaming-player',e.target.value); }}><option value="" disabled>Escoge perfil</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="icon-button" aria-label="Crear perfil de jugador" onClick={() => setNewProfile(true)}><Plus size={20} /></button></div>
    <div className="gaming-toolbar"><div className="gaming-tabs" aria-label="Filtrar consola">{[['all','Todo'],['psx','PlayStation 1'],['snes','Super Nintendo']].map(([id,label]) => <button key={id} className={system === id ? 'selected' : ''} onClick={() => setSystem(id)} aria-pressed={system === id}>{label}</button>)}</div><label className="search-field"><Search size={18} /><input aria-label="Buscar juegos" value={query} onChange={e => setQuery(e.target.value)} placeholder="Busca próxima aventura…" /></label><button className="icon-button" aria-label="Actualizar juegos" onClick={() => void refresh()}><RefreshCw size={18} /></button></div>
    {loading ? <div className="gaming-empty" role="status"><LoaderCircle className="spin" /><p>Cargando colección…</p></div> : visible.length ? <div className="gaming-grid">{visible.map(g => <article className={`game-card game-${g.system}`} key={g.id}><button className="game-cover" onClick={() => play(g)} aria-label={`Jugar ${g.title}`}>{g.coverUrl ? <img src={g.coverUrl} alt="" loading="lazy" /> : <div className="game-cover-placeholder"><Gamepad2 size={58} strokeWidth={1.25} /><span>{g.title}</span></div>}<span className="game-console">{g.system === 'psx' ? 'PS1' : 'SNES'}</span><span className="game-play"><Play size={24} fill="currentColor" /></span></button><div className="game-caption"><div><h3>{g.title}</h3><p>{systemName(g.system)} · {bytes(g.size)}</p></div><button className="icon-button" aria-label={`Editar ${g.title}`} onClick={() => setEditing(g)}><Settings2 size={18} /></button></div></article>)}</div> : <div className="gaming-empty"><Gamepad2 size={52} strokeWidth={1.25} /><h3>{games.length ? 'Otra búsqueda, otra aventura.' : 'Primer juego, primera aventura.'}</h3><p>{games.length ? 'Prueba otro nombre o consola.' : 'Sube copia de tus juegos o títulos homebrew. Tu colección queda en Windows.'}</p>{!games.length && <button className="button gaming-primary" onClick={() => setUpload(true)}><UploadCloud size={18} /> Traer primer juego</button>}</div>}
    <div className="gaming-bottom-note"><Save size={19} /><p><strong>Partidas viajan contigo.</strong> Escoge mismo perfil en otro dispositivo para recuperar memory card o punto guardado. Usa «Guardar y salir» antes de cambiar de equipo.</p><span>EmulatorJS {config?.emulatorVersion || '4.2.3'}</span></div>
    {upload && <GameUpload name={name} config={config} notify={notify} onDone={() => { setUpload(false); changed(); }} onClose={() => setUpload(false)} />}
    {bios && <BiosDialog config={config} onClose={() => setBios(false)} onDone={changed} notify={notify} />}
    {newProfile && <NewPlayer name={name} onClose={() => setNewProfile(false)} onDone={p => { setProfile(p.id); writeLocal('gaming-player',p.id); setNewProfile(false); void refresh(); }} notify={notify} />}
    {editing && <GameDetails game={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); changed(); }} onDelete={() => { setDeleting(editing); setEditing(null); }} notify={notify} />}
    {deleting && <Dialog title="Eliminar juego" onClose={() => { if (!busy) setDeleting(null); }}><p>Eliminar «{deleting.title}» y todas sus partidas de casa. Esta acción no se puede deshacer.</p><div className="gaming-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={() => void remove()}><Trash2 size={17} />{busy ? 'Eliminando…' : 'Eliminar juego'}</button></div></Dialog>}
    {playing && validProfile && <GamePlayer game={playing} player={validProfile} onClose={() => setPlaying(null)} />}
  </section>;
}

async function coverUpload(id: string,file: File) { const data = new FormData(); data.append('cover',file); await api(`/api/gaming/games/${id}/cover`,{ method: 'POST',body: data }); }

function GameUpload({ name,config,notify,onDone,onClose }: { name: string; config: Config | null; notify: (s: string) => void; onDone: () => void; onClose: () => void }) {
  const [system,setSystem] = useState('psx'), [title,setTitle] = useState(''), [region,setRegion] = useState('auto'), [file,setFile] = useState<File | null>(null), [cover,setCover] = useState<File | null>(null);
  const [busy,setBusy] = useState(false), [progress,setProgress] = useState(0), [error,setError] = useState('');
  const xhrRef = useRef<XMLHttpRequest | null>(null); useEffect(() => () => xhrRef.current?.abort(),[]);
  const spec = config?.systems.find(s => s.id === system), max = Math.min(spec?.maxBytes || 1024**3,config?.maxUploadBytes || 1024**3);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file || busy) return;
    if (file.size > max) { setError(`Archivo supera límite de ${bytes(max)}.`); return; }
    if (cover && cover.size > 4*1024**2) { setError('Portada admite máximo 4 MB.'); return; }
    setBusy(true); setError('');
    const data = new FormData(); data.append('title',title.trim()); data.append('system',system); data.append('region',region); data.append('addedBy',name || 'Alguien de casa'); data.append('rom',file);
    try {
      const game = await new Promise<Game>((resolve,reject) => {
        const xhr = new XMLHttpRequest(); xhrRef.current = xhr; xhr.open('POST','/api/gaming/games'); xhr.responseType = 'json';
        xhr.upload.onprogress = p => { if (p.lengthComputable) setProgress(Math.round(p.loaded/p.total*100)); };
        xhr.onload = () => { if (xhr.status === 401) window.dispatchEvent(new Event('casacine:unauthorized')); if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response.game); else reject(new Error(xhr.response?.error || 'No pudimos subir juego.')); };
        xhr.onerror = () => reject(new Error('Conexión perdida. Reintenta subida.')); xhr.onabort = () => reject(new Error('Subida cancelada.')); xhr.send(data);
      });
      if (cover) { try { await coverUpload(game.id,cover); } catch(e) { notify(`Juego guardado; portada pendiente: ${(e as Error).message}`); } }
      onDone(); notify('Juego agregado a colección.');
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Traer juego a Guarida" onClose={() => { if (!busy) onClose(); }}><form className="gaming-form" onSubmit={e => void submit(e)}>
    <label>Consola<select disabled={busy} value={system} onChange={e => { setSystem(e.target.value); setFile(null); }}><option value="psx">PlayStation 1</option><option value="snes">Super Nintendo</option></select></label>
    <p className="gaming-help">{system === 'psx' ? 'CHD v5, PBP de PS1 o ZIP con un CUE y todas sus pistas BIN/SBI en raíz, sin carpetas. Usa CHD para archivos compactos.' : 'SFC, SMC o ZIP con una única ROM, sin carpetas.'} Máximo {bytes(max)}.</p>
    <label className="gaming-drop"><UploadCloud size={27} /><strong>{file?.name || 'Seleccionar juego'}</strong><input key={system} disabled={busy} type="file" required accept={spec?.extensions.join(',') || (system === 'psx' ? '.chd,.pbp,.zip' : '.sfc,.smc,.zip')} onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/,'').slice(0,160)); }} /></label>
    <label>Nombre<input value={title} required maxLength={160} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
    {system === 'psx' && <label>Región<select value={region} disabled={busy} onChange={e => setRegion(e.target.value)}>{Object.entries(regionName).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    <label>Portada opcional · PNG/JPG, 4 MB<input type="file" disabled={busy} accept=".png,.jpg,.jpeg" onChange={e => setCover(e.target.files?.[0] || null)} /></label>
    {error && <p className="gaming-error" role="alert">{error}</p>}{busy && <div className="gaming-upload-progress" role="status"><progress max={100} value={progress} /><span>{progress < 100 ? `Subiendo ${progress}%` : 'Preparando biblioteca…'}</span></div>}
    <button className="button gaming-primary" disabled={!file || !title.trim() || busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}{busy ? 'Guardando…' : 'Agregar juego'}</button>
  </form></Dialog>;
}

function BiosDialog({ config,onClose,onDone,notify }: { config: Config | null; onClose: () => void; onDone: () => void; notify: (s: string) => void }) {
  const [file,setFile] = useState<File | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); if (!file || busy) return; setBusy(true); setError(''); const data = new FormData(); data.append('bios',file);
    try { await api('/api/gaming/bios',{ method: 'POST',body: data }); onDone(); setFile(null); notify('BIOS identificada y guardada. Vuelve a abrir juego para usarla.'); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="BIOS de PlayStation 1" onClose={() => { if (!busy) onClose(); }}><form className="gaming-form" onSubmit={e => void submit(e)}><p className="gaming-help">Carga BIOS de tu consola. Detectamos región y comprobamos huella del archivo. Sin BIOS, PS1 usa emulación HLE con menor compatibilidad.</p><div className="gaming-bios-list">{config?.bios.length ? config.bios.map(b => <p key={b.region}><ShieldCheck size={17} /><strong>{b.filename}</strong><span>{regionName[b.region]}</span></p>) : <p>No hay BIOS guardadas.</p>}</div><label>Archivo BIN · máximo 1 MB<input type="file" accept=".bin" required disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)} /></label>{error && <p className="gaming-error" role="alert">{error}</p>}<button className="button gaming-primary" disabled={busy || !file || file.size > 1024**2}>{busy ? 'Guardando…' : 'Guardar BIOS'}</button></form></Dialog>;
}

function NewPlayer({ name,onClose,onDone,notify }: { name: string; onClose: () => void; onDone: (p: Player) => void; notify: (s: string) => void }) {
  const [value,setValue] = useState(name), [busy,setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; setBusy(true);
    try { const r = await api<{ player: Player }>('/api/gaming/players',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ name: value.trim() }) }); onDone(r.player); }
    catch(e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Tu perfil de jugador" onClose={() => { if (!busy) onClose(); }}><form className="gaming-form" onSubmit={e => void submit(e)}><p className="gaming-help">Partidas se guardan por jugador. Escoge mismo perfil cuando juegues desde otro dispositivo de casa.</p><label>Nombre<input autoFocus required maxLength={60} value={value} disabled={busy} onChange={e => setValue(e.target.value)} /></label><button className="button gaming-primary" disabled={!value.trim() || busy}>{busy ? 'Preparando…' : 'Usar perfil'}</button></form></Dialog>;
}

function GameDetails({ game,onClose,onDone,onDelete,notify }: { game: Game; onClose: () => void; onDone: () => void; onDelete: () => void; notify: (s: string) => void }) {
  const [title,setTitle] = useState(game.title), [region,setRegion] = useState(game.region), [cover,setCover] = useState<File | null>(null), [busy,setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; setBusy(true);
    try { await api(`/api/gaming/games/${game.id}`,{ method: 'PATCH',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ title: title.trim(),region }) }); if (cover) await coverUpload(game.id,cover); onDone(); }
    catch(e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Ficha de juego" onClose={() => { if (!busy) onClose(); }}><form className="gaming-form" onSubmit={e => void submit(e)}><p className="gaming-help">{systemName(game.system)} · {bytes(game.size)} · {game.addedBy}</p><label>Nombre<input required maxLength={160} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>{game.system === 'psx' && <label>Región<select value={region} disabled={busy} onChange={e => setRegion(e.target.value)}>{Object.entries(regionName).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>}<label><ImagePlus size={17} /> Cambiar portada · PNG/JPG, 4 MB<input type="file" accept=".jpg,.jpeg,.png" disabled={busy} onChange={e => setCover(e.target.files?.[0] || null)} /></label><button className="button gaming-primary" disabled={busy || !title.trim()}>{busy ? 'Guardando…' : 'Guardar ficha'}</button><div className="gaming-actions"><a className="button secondary" href={game.downloadUrl} download><Download size={17} /> Descargar juego</a><button type="button" className="button danger" disabled={busy} onClick={onDelete}><Trash2 size={17} /> Eliminar</button></div></form></Dialog>;
}

function GamePlayer({ game,player,onClose }: { game: Game; player: Player; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null), panel = useRef<HTMLDivElement>(null);
  const [status,setStatus] = useState('Preparando emulador…'), [ready,setReady] = useState(false), [closing,setClosing] = useState(false), [resume,setResume] = useState(true);
  useEffect(() => {
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const handler = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.source !== 'guarida-gaming') return;
      if (e.data.type === 'exit') { onClose(); return; }
      if (e.data.type === 'started') setReady(true);
      if (e.data.type === 'error') setClosing(false);
      setStatus(e.data.text || 'Jugando · memory card se guarda cada 15 segundos.');
    };
    addEventListener('message',handler); return () => { document.body.style.overflow = old; removeEventListener('message',handler); };
  },[onClose]);
  function command(command: string) { frame.current?.contentWindow?.postMessage({ source: 'guarida-gaming',command },location.origin); }
  return <div className="gaming-player-overlay" role="dialog" aria-modal="true" aria-label={`Jugando ${game.title}`} ref={panel}>
    <header className="gaming-player-heading"><div><Gamepad2 size={23} /><span><strong>{game.title}</strong><small>{systemName(game.system)} · {player.name}</small></span></div><button className="button secondary" disabled={closing} onClick={() => { setClosing(true); command('exit'); }}>{closing ? 'Guardando…' : ready ? 'Guardar y salir' : 'Cerrar'}<X size={18} /></button></header>
    <div className="gaming-player-toolbar"><button disabled={!ready || closing} onClick={() => command('save')}><Save size={17} /> Guardar punto</button><button disabled={!ready || closing} onClick={() => command('load')}><RefreshCw size={17} /> Recuperar punto</button><button disabled={!ready || closing} onClick={() => command('pause')}><Pause size={17} /> Pausa</button><button disabled={!ready || closing} onClick={() => command('controls')}><Settings2 size={17} /> Controles</button><button disabled={!ready} onClick={() => command('export')}><Download size={17} /> Exportar</button><button onClick={() => { void panel.current?.requestFullscreen().catch(() => setStatus('Pantalla completa no disponible en este navegador.')); }}><Maximize size={17} /> Pantalla completa</button></div>
    <div className="gaming-player-frame"><iframe ref={frame} title={`${game.title} · emulador`} src={`/gaming-player/player.html?game=${game.id}&player=${player.id}&resume=${resume ? '1' : '0'}`} allow="gamepad; fullscreen; autoplay" /></div>
    <footer className="gaming-player-footer"><span role="status">{status}</span>{!ready && <label><input type="checkbox" checked={resume} onChange={e => setResume(e.target.checked)} /> Continuar punto guardado al iniciar</label>}<button onClick={() => { if (confirm('Salir sin guardar punto actual? Partidas guardadas antes se conservan.')) onClose(); }}>Salir sin guardar</button></footer>
  </div>;
}
