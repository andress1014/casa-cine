import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Search, Heart, Clock3, House, Shuffle, ArrowUpRight, Wifi, Film, Monitor, X,
  Sparkles, ArrowRight, UploadCloud, ChevronDown, Popcorn, Copy, Check, Laptop, Smartphone, Tv, LoaderCircle,
  AlertTriangle, LogOut, Settings2, Menu, FolderOpen, Gamepad2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { Upload } from './Upload';
import { Player } from './Player';
import { Home } from './Home';
import { Gaming } from './Gaming';
import { Files } from './Files';
import { currentSection, sectionPaths, type Section, type Hub } from './home-types';
import modules from '../shared/home-modules.json';
import { api, bytes, categories, duration, readLocal, writeLocal, type Media, type System, type WatchProgress } from './types';

type View = 'library' | 'favourites' | 'continue';
type Modal = 'upload' | 'network' | 'profile' | 'about' | null;
const nav = [
  { id: 'library' as const, label: 'Mi videoclub', icon: House },
  { id: 'favourites' as const, label: 'Mis favoritos', icon: Heart },
  { id: 'continue' as const, label: 'Seguir viendo', icon: Clock3 },
];
function initialFavourites() { const value = readLocal<unknown>('favourites', []); return Array.isArray(value) ? value.filter(v => typeof v === 'string') as string[] : []; }
function launcherUser() {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('user');
  if (!value) return '';
  const clean = value.replace(/[\x00-\x1f]/g, '').trim().slice(0,60);
  if (clean) writeLocal('device-user', clean);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return clean;
}
function initialProgress(): WatchProgress {
  const value = readLocal<unknown>('progress', {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, p]) => /^[a-f0-9-]{36}$/.test(id) && p && typeof p.time === 'number' && typeof p.duration === 'number' && typeof p.updatedAt === 'number'));
}

function Brand() { return <div className="brand guarida-brand"><span className="brand-mark"><House size={25} strokeWidth={2.4} /></span><span>guarida<span className="brand-dot">.</span><small>CASA CONECTADA</small></span></div>; }

function MovieCard({ media, favourite, progress, onPlay, onFavourite }: { media: Media; favourite: boolean; progress?: WatchProgress[string]; onPlay: () => void; onFavourite: () => void }) {
  const watched = progress && progress.time > 5 && progress.time < progress.duration * 0.95;
  return <article className={`movie-card card-${categories.indexOf(media.category)}`}>
    <button className="movie-cover" data-tv onClick={onPlay} aria-label={`${media.status === 'ready' ? 'Reproducir' : 'Ver estado de'} ${media.title}`}>
      {media.posterUrl ? <img src={media.posterUrl} alt="" loading="lazy" /> : <div className="cover-placeholder"><Film size={44} strokeWidth={1} /><span>{media.category}</span></div>}
      <div className="cover-scrim" /><span className="format-badge">{media.status === 'ready' ? media.height >= 2160 ? '4K' : media.height >= 1080 ? 'HD' : media.format : media.status === 'processing' ? 'Preparando' : 'Reintentar'}</span>
      <span className="cover-play">{media.status === 'processing' ? <LoaderCircle size={24} className="spin" /> : media.status === 'error' ? <AlertTriangle size={23} /> : <Play size={23} fill="currentColor" />}</span>
      <span className="duration-badge">{duration(media.duration)}</span>
      {watched && <span className="watch-bar"><span style={{ width: `${Math.min(100, progress.time / progress.duration * 100)}%` }} /></span>}
      {media.status === 'processing' && <span className="watch-bar"><span style={{ width: `${Math.max(3, media.progress)}%` }} /></span>}
    </button>
    <div className="movie-caption"><div><h3>{media.title}</h3><p>{media.category}<span>·</span>{media.addedBy}</p></div>
      <button data-tv className={`card-heart ${favourite ? 'active' : ''}`} onClick={onFavourite} aria-label={`${favourite ? 'Quitar de' : 'Agregar a'} favoritos: ${media.title}`} aria-pressed={favourite}><Heart size={19} fill={favourite ? 'currentColor' : 'none'} /></button></div>
  </article>;
}

export function App() {
  const [section, setSection] = useState<Section>(currentSection);
  const [hub, setHub] = useState<Hub | null>(null);
  const [hubFailed, setHubFailed] = useState(false);
  const [session, setSession] = useState<'loading' | 'locked' | 'open' | 'failed'>('loading');
  const [media, setMedia] = useState<Media[]>([]);
  const [system, setSystem] = useState<System | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('library');
  const [collection, setCollection] = useState('Todo');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [favourites, setFavourites] = useState(initialFavourites);
  const [progress, setProgress] = useState<WatchProgress>(initialProgress);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [name, setName] = useState(() => {
    const automatic = launcherUser(); const chosen = readLocal<unknown>('user-name', '');
    const value = typeof chosen === 'string' && chosen.trim() ? chosen : automatic || readLocal<unknown>('device-user','');
    return typeof value === 'string' ? value.slice(0,60) : '';
  });
  const [identitySource, setIdentitySource] = useState<'system' | 'chosen'>('chosen');
  const [tvMode, setTvMode] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6500); }, []);
  const refresh = useCallback(async () => {
    try { const result = await api<{ media: Media[] }>('/api/media'); setMedia(result.media); setConnected(true); }
    catch { setConnected(false); } finally { setLoading(false); }
  }, []);
  const checkSession = useCallback(() => { setSession('loading'); void api<{ authenticated: boolean }>('/api/session').then(s => setSession(s.authenticated ? 'open' : 'locked')).catch(() => setSession('failed')); }, []);
  const refreshHub = useCallback(async () => {
    try { const result = await api<Hub>('/api/hub'); setHub(result); setHubFailed(false); }
    catch { setHubFailed(true); }
  }, []);
  function goSection(next: Section) {
    if (window.location.pathname !== sectionPaths[next]) window.history.pushState(null, '', sectionPaths[next]);
    setSection(next); setMobileMenu(false); setTvMode(false); setSelected(null); setModal(null);
  }
  useEffect(() => {
    const pop = () => { setSection(currentSection()); setMobileMenu(false); setTvMode(false); setSelected(null); setModal(null); };
    window.addEventListener('popstate',pop); return () => window.removeEventListener('popstate',pop);
  }, []);
  useEffect(() => { document.title = `${section === 'cinema' ? 'Palomita' : section === 'files' ? 'Archivos' : section === 'gaming' ? 'Gaming' : 'Tu casa'} · Guarida`; },[section]);
  useEffect(checkSession, [checkSession]);
  useEffect(() => {
    const handler = () => { setSession('locked'); setModal(null); setSelected(null); };
    window.addEventListener('casacine:unauthorized', handler);
    return () => window.removeEventListener('casacine:unauthorized', handler);
  }, []);
  useEffect(() => {
    if (session !== 'open') return;
    void api<{ user: string | null }>('/api/device').then(device => {
      const chosen = readLocal<unknown>('user-name', '');
      if (typeof chosen === 'string' && chosen.trim()) { setName(chosen.slice(0,60)); return; }
      const local = readLocal<unknown>('device-user', '');
      if (device.user) { setName(device.user); setIdentitySource('system'); }
      else if (typeof local === 'string' && local.trim()) { setName(local.slice(0,60)); setIdentitySource('system'); }
      else setModal(previous => previous || 'profile');
    }).catch(() => { if (!readLocal('user-name', '') && !readLocal('device-user', '')) setModal(previous => previous || 'profile'); });
    void refreshHub();
    const hubTimer = setInterval(() => { if (document.visibilityState === 'visible') void refreshHub(); },10000);
    void refresh(); void api<System>('/api/system').then(setSystem).catch(() => setConnected(false));
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 4000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(interval); clearInterval(hubTimer); document.removeEventListener('visibilitychange', visible); };
  }, [session, refresh, refreshHub]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    if (!tvMode) return;
    function move(event: KeyboardEvent) {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(event.key) || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { setTvMode(false); return; }
      if (document.activeElement?.matches('input,textarea,select')) return;
      const buttons = [...document.querySelectorAll<HTMLElement>('[data-tv]')].filter(e => e.getBoundingClientRect().width > 0);
      const focused = document.activeElement as HTMLElement;
      if (!buttons.includes(focused)) { event.preventDefault(); buttons[0]?.focus(); return; }
      const from = focused.getBoundingClientRect(); const x = from.x + from.width / 2, y = from.y + from.height / 2;
      const direction = event.key;
      const candidates = buttons.filter(b => b !== focused).map(element => {
        const rect = element.getBoundingClientRect(); const dx = rect.x + rect.width / 2 - x, dy = rect.y + rect.height / 2 - y;
        const valid = direction === 'ArrowLeft' ? dx < -8 : direction === 'ArrowRight' ? dx > 8 : direction === 'ArrowUp' ? dy < -8 : dy > 8;
        const score = direction === 'ArrowLeft' || direction === 'ArrowRight' ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
        return { element, valid, score };
      }).filter(c => c.valid).sort((a,b) => a.score - b.score);
      if (candidates[0]) { event.preventDefault(); candidates[0].element.focus(); }
    }
    window.addEventListener('keydown', move); return () => window.removeEventListener('keydown', move);
  }, [tvMode]);

  const saveProgress = useCallback((id: string, time: number, length: number) => {
    if (!Number.isFinite(time) || !Number.isFinite(length) || length <= 0) return;
    setProgress(previous => { const updated = { ...previous, [id]: { time, duration: length, updatedAt: Date.now() } }; writeLocal('progress', updated); return updated; });
  }, []);
  function toggleFavourite(id: string) { setFavourites(previous => { const next = previous.includes(id) ? previous.filter(v => v !== id) : [...previous, id]; writeLocal('favourites', next); return next; }); }
  function changed(item: Media) { setMedia(previous => [item, ...previous.filter(m => m.id !== item.id)].sort((a,b) => b.createdAt.localeCompare(a.createdAt))); }
  function chooseView(next: View) { if (section !== 'cinema') goSection('cinema'); setView(next); setCollection('Todo'); setSearch(''); setMobileMenu(false); }
  const continuing = media.filter(m => progress[m.id]?.time > 5 && progress[m.id].time < progress[m.id].duration * 0.95);
  const visible = useMemo(() => {
    const normalized = search.toLocaleLowerCase();
    return media.filter(m => (view !== 'favourites' || favourites.includes(m.id))
      && (view !== 'continue' || (progress[m.id]?.time > 5 && progress[m.id].time < progress[m.id].duration * 0.95))
      && (collection === 'Todo' || m.category === collection)
      && `${m.title} ${m.description} ${m.addedBy}`.toLocaleLowerCase().includes(normalized))
      .sort((a,b) => sort === 'name' ? a.title.localeCompare(b.title, 'es') : sort === 'duration' ? b.duration - a.duration : view === 'continue' ? (progress[b.id]?.updatedAt || 0) - (progress[a.id]?.updatedAt || 0) : b.createdAt.localeCompare(a.createdAt));
  }, [media, search, view, favourites, progress, collection, sort]);
  const current = media.find(m => m.id === selected);
  const ready = media.filter(m => m.status === 'ready');
  const featured = ready[0];
  const totalBytes = media.reduce((total, item) => total + item.size, 0);
  const favouriteCount = media.filter(m => favourites.includes(m.id)).length;
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 2000); }
    catch { notify('Selecciona dirección y cópiala. Tu navegador no permite copia automática desde HTTP.'); }
  }
  function randomMovie() {
    if (!ready.length) { setModal('upload'); return; }
    const value = crypto.getRandomValues(new Uint32Array(1))[0]; setSelected(ready[value % ready.length].id);
  }

  if (session !== 'open') return <div className="entry-screen"><Brand />
    {session === 'loading' ? <div className="entry-panel"><LoaderCircle size={36} className="spin lime" /><h1>Preparando tu Guarida…</h1></div>
      : session === 'failed' ? <div className="entry-panel"><Wifi size={42} /><h1>Volvamos a conectar</h1><p>Revisa que servidor esté encendido y abre dirección local de tu PC.</p><button className="button primary" onClick={checkSession}>Reintentar <ArrowRight size={18} /></button></div>
        : <Login onLogin={() => setSession('open')} />}</div>;

  return <div className={`app-shell ${tvMode ? 'tv-mode' : ''}`}>
    <a href="#main-content" className="skip-link">Ir al contenido</a>
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)}><X size={20} /></button></div>
      <p className="nav-eyebrow">TU CASA, A TU MANERA</p>
      <nav className="module-navigation" aria-label="Secciones de Guarida">
        <button className={`nav-item ${section === 'home' ? 'selected' : ''}`} onClick={() => goSection('home')}><House size={20} /><span>Mi Guarida</span></button>
        {modules.map(module => { const Icon = module.id === 'cinema' ? Film : module.id === 'files' ? FolderOpen : Gamepad2; return <button key={module.id} className={`nav-item ${section === module.id ? 'selected' : ''}`} onClick={() => goSection(module.id as Section)}><Icon size={20} /><span>{module.name}</span>{module.status === 'planned' ? <span className="nav-soon">Pronto</span> : <span className="nav-count">{module.id === 'cinema' ? media.length : module.id === 'gaming' ? hub?.gaming?.count ?? '—' : hub?.files.count ?? '—'}</span>}</button>; })}
      </nav>
      {section === 'cinema' ? <><div className="sidebar-divider" /><nav className="cinema-subnav" aria-label="Biblioteca">{nav.map(item => <button key={item.id} data-tv className={`nav-item ${view === item.id ? 'selected' : ''}`} onClick={() => chooseView(item.id)}><item.icon size={18} /><span>{item.label}</span><span className="nav-count">{item.id === 'library' ? media.length : item.id === 'favourites' ? favouriteCount : continuing.length}</span></button>)}</nav><button className="nav-item shuffle-nav" data-tv onClick={randomMovie}><Shuffle size={18} /><span>Sorpréndeme</span><Sparkles size={15} /></button></>
        : <div className="sidebar-invite hub-invite"><span className="invite-icon"><Sparkles size={26} /></span><h3>Tu casa.<br />Tus reglas.</h3><p>Un rincón nuevo para cada idea. Esta Guarida crece contigo.</p><button className="invite-link" onClick={() => goSection('gaming')}>Entrar a Gaming <ArrowUpRight size={17} /></button></div>}
      <div className="sidebar-bottom"><button className="network-link" data-tv onClick={() => setModal('network')}><Wifi size={18} /><span>Conectar dispositivos</span><ArrowUpRight size={15} /></button>
        <button className="profile-button" data-tv onClick={() => setModal('profile')}><span className="avatar">{name.slice(0,1).toUpperCase() || '?'}</span><span><strong>{name || 'Tu nombre'}</strong><small>{identitySource === 'system' ? 'Usuario de este equipo' : 'Perfil de este dispositivo'}</small></span><Settings2 size={17} /></button></div>
    </aside>
    {mobileMenu && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
    <main id="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileMenu(true)}><Menu size={23} /></button><span className="topbar-title">{section === 'home' ? 'Tu casa, tu universo' : section === 'cinema' ? 'Palomita / Tu videoclub' : section === 'files' ? 'Archivos / Tu estante' : 'Gaming / Tu colección'}<span className="topbar-dot">✳</span></span></div>
        <div className="topbar-actions"><button className={`connection-pill ${connected ? '' : 'offline'}`} onClick={() => setModal('network')} data-tv><span className="status-dot" />{connected ? 'Estamos en casa' : 'Sin conexión'}<Wifi size={14} /></button>
          {section === 'cinema' && <button className={`tv-button ${tvMode ? 'active' : ''}`} data-tv aria-pressed={tvMode} onClick={() => { setTvMode(!tvMode); notify(tvMode ? 'Vista normal activada.' : 'Modo TV: navega con flechas y Enter. Escape para salir.'); }}><Monitor size={19} /><span>{tvMode ? 'Salir de modo TV' : 'Modo TV'}</span></button>}</div>
      </header>
      <div className="main-content">
        {hubFailed && section === 'home' && <div className="connection-warning" role="status"><Wifi size={18} /> No pudimos actualizar panel de casa.<button onClick={() => void refreshHub()}>Reintentar</button></div>}
        {section === 'home' && <Home hub={hub} media={media} name={name} protectedAccess={system?.protected || false} onNavigate={goSection} onRefresh={() => { void refreshHub(); void refresh(); }} onNetwork={() => setModal('network')} onUpload={() => { goSection('cinema'); setModal('upload'); }} onPlay={id => { goSection('cinema'); setSelected(id); }} />}
        {section === 'files' && <Files name={name} notify={notify} onChanged={() => void refreshHub()} />}
        {section === 'gaming' && <Gaming name={name} notify={notify} onChanged={() => void refreshHub()} />}
        {section === 'cinema' && <>
        {view === 'library' && !search && collection === 'Todo' && <section className={`hero ${featured ? 'hero-featured' : ''}`} aria-label="Bienvenida">
          {(featured?.backdropUrl || featured?.posterUrl) && <img className="hero-backdrop" src={featured.backdropUrl || featured.posterUrl || undefined} alt="" />}
          <div className="hero-text"><span className="hero-eyebrow"><span /> {featured ? 'HOY EN TU VIDEOCLUB' : 'ENTRADAS ILIMITADAS. BUENA COMPAÑÍA.'}</span>
            <h1>{featured ? <>{featured.title}<span className="hero-title-dot">.</span></> : <>El mejor plan<br />está en <span className="hero-word">casa<svg viewBox="0 0 230 18" aria-hidden="true"><path d="M4 12Q98-2 226 10" /></svg></span>.</> }</h1>
            <p>{featured ? featured.description || `${featured.category} · ${duration(featured.duration)} · Traído por ${featured.addedBy}. Dale play y disfruta.` : 'Películas, recuerdos y videos que nos unen.\nTu pequeño universo de historias, sin salir de casa.'}</p>
            <div className="hero-actions"><button className="button primary" data-tv onClick={() => featured ? setSelected(featured.id) : setModal('upload')}>{featured ? <Play size={18} fill="currentColor" /> : <Plus size={21} />}{featured ? 'Dale play' : 'Subir mi primer video'}<ArrowUpRight size={18} /></button>
              <button className="hero-secondary" data-tv onClick={randomMovie}><Shuffle size={17} /> {featured ? 'Elige por mí' : 'Tú pones las historias'}</button></div>
            <div className="hero-footnote"><Wifi size={13} /> Hecho para compartir en tu red local</div>
          </div>
          {!featured && <div className="hero-art" aria-hidden="true"><img src="/cinema.svg" alt="" /></div>}
          <span className="hero-corner" aria-hidden="true">✳</span>
        </section>}

        {view === 'library' && !search && collection === 'Todo' && <div className="library-ribbon"><div><span className="ribbon-icon"><Film size={19} /></span><strong>{media.length}</strong><span>{media.length === 1 ? 'historia' : 'historias'} en casa</span></div><span className="ribbon-divider" /><div><span className="ribbon-icon"><Heart size={18} /></span><strong>{favouriteCount}</strong><span>en tu lista</span></div><span className="ribbon-divider" /><div><span className="ribbon-icon"><Monitor size={19} /></span><strong>{bytes(totalBytes)}</strong><span>de buenos planes</span></div><span className="ribbon-note">Siempre hay algo por descubrir <Sparkles size={16} /></span></div>}

        <section className="catalogue" id="catalogue" aria-label="Catálogo de videos">
          <div className="section-heading"><div><span className="section-eyebrow">{view === 'library' ? 'PARA TODOS LOS GUSTOS' : view === 'favourites' ? 'VALE LA PENA REPETIR' : 'TU PLAN SIGUE AQUÍ'}</span><h2>{view === 'library' ? 'Tu cartelera' : view === 'favourites' ? 'Tus favoritos' : 'Seguir viendo'}<span className="heading-count">{visible.length}</span></h2></div>
            <button className="button upload-button" data-tv onClick={() => setModal('upload')}><Plus size={19} /> Subir videos</button></div>
          <div className="catalogue-toolbar"><div className="collection-tabs" role="group" aria-label="Filtrar por colección">{['Todo', ...categories].map(c => <button data-tv className={collection === c ? 'active' : ''} aria-pressed={collection === c} key={c} onClick={() => setCollection(c)}>{c}</button>)}</div></div>
          <div className="search-row"><label className="search-field"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Busca tu próximo plan…" aria-label="Buscar videos" />{search && <button className="icon-button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={16} /></button>}</label>
            <label className="sort-field"><span>Ordenar:</span><select aria-label="Ordenar videos" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="duration">Más largos</option></select><ChevronDown size={14} /></label></div>
          {!connected && <div className="connection-warning" role="status"><Wifi size={19} /> Perdimos conexión con la PC. Reintentaremos automáticamente.<button onClick={() => void refresh()}>Reintentar</button></div>}
          {loading ? <div className="movie-grid">{[0,1,2].map(i => <div className="skeleton-card" key={i} />)}</div> : visible.length ? <div className="movie-grid">{visible.map(m => <MovieCard key={m.id} media={m} favourite={favourites.includes(m.id)} progress={progress[m.id]} onPlay={() => setSelected(m.id)} onFavourite={() => toggleFavourite(m.id)} />)}</div>
            : <div className="empty-state"><div className="empty-visual"><span className="empty-orbit" /><span className="empty-film">{view === 'favourites' ? <Heart size={36} /> : view === 'continue' ? <Clock3 size={36} /> : search ? <Search size={36} /> : <Film size={36} />}</span><span className="empty-spark">✳</span><span className="empty-dot" /></div>
              <h3>{search || collection !== 'Todo' ? 'Ese plan todavía no está aquí' : view === 'favourites' ? 'Las mejores historias se guardan' : view === 'continue' ? 'Aquí retomamos la historia' : 'Tu primera función empieza contigo'}</h3>
              <p>{search || collection !== 'Todo' ? 'Prueba otra búsqueda o explora todas las colecciones.' : view === 'favourites' ? 'Toca el corazón de cualquier video para tenerlo siempre a mano.' : view === 'continue' ? 'Reproduce un video y guardaremos dónde quedaste en este dispositivo.' : 'Trae una película, un recuerdo o ese video que todos deben ver.\nEl resto de la casa podrá disfrutarlo desde su pantalla favorita.'}</p>
              {search || collection !== 'Todo' ? <button className="button secondary" data-tv onClick={() => { setSearch(''); setCollection('Todo'); }}>Ver toda colección <ArrowRight size={17} /></button> : view !== 'library' ? <button className="button secondary" data-tv onClick={() => chooseView('library')}>Explorar videoclub <ArrowRight size={17} /></button> : <button className="button empty-upload" data-tv onClick={() => setModal('upload')}><UploadCloud size={19} /> Agregar videos <ArrowUpRight size={17} /></button>}
            </div>}
        </section>
        <div className="how-it-works"><div className="how-title"><span>EL PLAN ES SIMPLE</span><h3>De tu equipo<br />a cualquier pantalla.</h3></div><div className="how-step"><span className="step-number">01</span><UploadCloud size={23} /><h4>Trae tus historias</h4><p>Sube desde cualquier equipo de casa.</p></div><div className="how-step"><span className="step-number">02</span><Wifi size={23} /><h4>Comparte el plan</h4><p>Abre Palomita en la misma red.</p></div><div className="how-step"><span className="step-number">03</span><Popcorn size={23} /><h4>Ponte cómodo</h4><p>Dale play. Nosotros ponemos el cine.</p></div></div>
        <footer className="footer"><span>palomita<span>.</span> <span className="footer-separator">/</span> Pequeño cine. Grandes momentos.</span><button data-tv onClick={() => setModal('about')}>Acerca de</button><button data-tv onClick={() => setModal('network')}>Tu cine va contigo, dentro de casa <ArrowUpRight size={14} /></button></footer>
        </>}
      </div>
    </main>
    {modal === 'upload' && <Upload maxBytes={system?.maxUploadBytes || 30 * 1024 ** 3} name={name} onClose={() => setModal(null)} onUploaded={changed} notify={notify} />}
    {modal === 'about' && <Dialog title="Acerca de Palomita" onClose={() => setModal(null)}><p className="dialog-intro">Tu videoclub dentro de Guarida. Videos e imágenes guardados en casa.</p><div className="tmdb-credit"><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="/branding/tmdb.svg" alt="TMDB" /></a><span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span></div></Dialog>}
    {current && <Player media={current} saved={progress[current.id]} favourite={favourites.includes(current.id)} toggleFavourite={() => toggleFavourite(current.id)} saveProgress={saveProgress} onClose={() => setSelected(null)} onChanged={changed} onRemoved={id => setMedia(previous => previous.filter(m => m.id !== id))} notify={notify} />}
    {modal === 'network' && <Dialog title="Conecta tu casa" onClose={() => setModal(null)}><p className="dialog-intro">Conecta dispositivos a mismo Wi-Fi o router y abre esta dirección. Guarida comparte cine y archivos dentro de casa.</p><div className="device-row"><Laptop size={34} /><Smartphone size={29} /><Tv size={36} /></div>
      <div className="network-addresses">{(system?.urls.length ? system.urls : [window.location.origin]).map(url => <div className="network-address" key={url}><input aria-label="Dirección para conectar" readOnly value={url} onFocus={e => e.target.select()} /><button className="icon-button" onClick={() => void copy(url)} aria-label="Copiar dirección">{copied === url ? <Check size={19} /> : <Copy size={19} />}</button></div>)}</div>
      <div className="help-note"><Wifi size={21} /><div><strong>Mismo Wi-Fi. Toda tu Guarida.</strong><p>PC debe estar encendida, con servidor abierto y sin suspensión. Red de invitados puede impedir conexión entre equipos.</p></div></div><p className="network-tv-tip"><strong>Android TV:</strong> instala Palomita TV mediante APK y USB. App encuentra PC en Wi-Fi y se maneja con control remoto. Sube videos desde PC o teléfono.</p><p className="muted small">{system?.protected ? 'Acceso protegido con código de casa.' : 'Acceso disponible para dispositivos de tu red local.'} Archivos quedan guardados en PC servidor.</p>
    </Dialog>}
    {modal === 'profile' && <Dialog title="Tu rincón de casa" onClose={() => setModal(null)}><p className="dialog-intro">{identitySource === 'system' ? 'Detectamos usuario de este equipo. Puedes cambiar nombre para Guarida.' : 'Tu navegador no permite leer usuario del sistema. Escribe tu nombre una vez para este dispositivo.'} Este nombre identificará archivos y videos que subas desde aquí. Favoritos e historial se guardan en este navegador.</p><label className="form-label">Tu nombre<input value={name} maxLength={60} onChange={event => setName(event.target.value.replace(/[\x00-\x1f]/g, ''))} placeholder="Andrés, María…" /></label><div className="dialog-footer"><span>Tu perfil queda en este dispositivo.</span><button className="button primary" disabled={!name.trim()} onClick={() => { writeLocal('user-name', name.trim()); setName(name.trim()); setIdentitySource('chosen'); setModal(null); notify('Nombre guardado.'); }}><Check size={18} /> Guardar</button></div><button className="button secondary" onClick={() => setModal('about')}>Acerca de Palomita</button>{system?.protected && <button className="button secondary logout-button" onClick={() => { void api('/api/session', { method: 'DELETE' }).then(() => { setModal(null); setSession('locked'); }).catch(error => notify(error.message)); }}><LogOut size={18} /> Salir de este dispositivo</button>}</Dialog>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={17} /></button></div>}
  </div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <form className="entry-panel" onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void api('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).then(onLogin).catch(error => setError(error.message)).finally(() => setBusy(false)); }}>
    <span className="entry-icon"><Popcorn size={36} /></span><span className="section-eyebrow">TE GUARDAMOS UN LUGAR</span><h1>Bienvenido a casa.</h1><p>Escribe código de casa para entrar a Guarida.</p><label className="form-label">Código de casa<input type="password" autoFocus value={code} maxLength={128} autoComplete="current-password" onChange={e => setCode(e.target.value)} required /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <Play size={18} fill="currentColor" />} Entrar a Guarida</button>
  </form>;
}
