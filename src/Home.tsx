import { ArrowUpRight, ArrowRight, Film, FolderOpen, Gamepad2, HardDrive, Wifi, Sparkles, FileText, Clock3, ShieldCheck, House, RefreshCw, Download } from 'lucide-react';
import modules from '../shared/home-modules.json';
import { bytes, type Media } from './types';
import { type Hub, type Section } from './home-types';

const icons = { cinema: Film, files: FolderOpen, gaming: Gamepad2 };
const day = (value: string) => new Date(value).toLocaleDateString('es',{ day: 'numeric', month: 'short' });

export function Home({ hub, media, name, protectedAccess, onNavigate, onPlay, onUpload, onNetwork, onRefresh }: {
  hub: Hub | null; media: Media[]; name: string; protectedAccess: boolean; onNavigate: (section: Section) => void;
  onPlay: (id: string) => void; onUpload: () => void; onNetwork: () => void; onRefresh: () => void;
}) {
  const movies = media.filter(m => m.status === 'ready').slice(0,3);
  const free = hub?.storage.availableBytes || 0, total = hub?.storage.totalBytes || 0;
  return <div className="home-page">
    <div className="home-greeting"><span><House size={15} /> {name ? `Hola, ${name}. Estás en casa.` : 'Tu lugar favorito empieza aquí.'}</span><button onClick={onRefresh} className="icon-button" aria-label="Actualizar panel"><RefreshCw size={17} /></button></div>
    <section className="home-hero" aria-label="Bienvenida a Guarida">
      <div className="home-hero-copy"><span className="section-eyebrow"><span className="status-dot" /> BIENVENIDO A TU GUARIDA</span>
        <h1>Todo lo tuyo.<br />Un solo <span>refugio<svg viewBox="0 0 260 15" aria-hidden="true"><path d="M3 11Q124-4 256 9" /></svg></span>.</h1>
        <p>Historias para ver, cosas para guardar y aventuras por venir. Tu pequeño universo, conectado dentro de casa.</p>
        <div className="home-hero-buttons"><button className="button primary" onClick={() => onNavigate('files')}><FolderOpen size={18} /> Ordenar mi rincón <ArrowUpRight size={18} /></button>
          <button className="home-quiet-button" onClick={() => onNavigate('cinema')}><Film size={17} /> Noche de cine</button></div>
        <span className="home-local"><Wifi size={14} /> Vive en tu PC. Se comparte en casa.</span>
      </div>
      <div className="home-illustration" aria-hidden="true"><svg viewBox="0 0 460 360">
        <ellipse cx="242" cy="318" rx="174" ry="18" fill="#0c1009" />
        <path d="M65 152 235 30l169 122" fill="none" stroke="#738c4b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M93 137 234 48l143 89v174H93z" fill="#26351d" stroke="#4c6536" strokeWidth="3" />
        <rect x="118" y="164" width="233" height="134" rx="12" fill="#182211" stroke="#6e844b" strokeWidth="3" />
        <path d="M118 226h233M238 164v134" stroke="#526a37" strokeWidth="3" />
        <rect x="136" y="177" width="85" height="38" rx="6" fill="#d8fc70" transform="rotate(-5 178 196)" />
        <path d="m171 185 22 12-22 12" fill="#2f411e" />
        <path d="M259 184h25l8 8h39v22h-72z" fill="#9cc6e3" />
        <rect x="143" y="246" width="65" height="33" rx="6" fill="#e4a98d" transform="rotate(4 175 262)" />
        <path d="M157 252v18m-9-9h18" stroke="#654330" strokeWidth="3" /><circle cx="191" cy="258" r="3" fill="#654330" />
        <rect x="261" y="243" width="18" height="35" rx="3" fill="#627c48" /><rect x="285" y="249" width="16" height="29" rx="3" fill="#b3c691" /><rect x="307" y="237" width="20" height="41" rx="3" fill="#819861" />
        <path d="M144 298v16m181-16v16" stroke="#6e844b" strokeWidth="7" strokeLinecap="round" />
        <circle cx="235" cy="118" r="22" fill="#3c5328" stroke="#8eaa5e" strokeWidth="2" /><path d="M224 118h22m-11-11v22" stroke="#d8fc70" strokeWidth="3" />
        <path d="m48 79 10 13 15-5-7 14 9 12-16-2-8 13-2-16-15-6 14-5z" fill="#e4a98d" />
        <path d="m397 233 7 10 12-3-6 10 6 10-12-3-7 10-1-12-11-5 11-5z" fill="#d8fc70" />
        <circle cx="386" cy="66" r="6" fill="#9cc6e3" /><circle cx="60" cy="245" r="4" fill="#8ea86e" />
      </svg><span className="home-art-sticker"><Sparkles size={14} /> Aquí caben tus ideas</span></div>
    </section>

    <div className="home-stats"><div><span className="home-stat-icon"><Film size={19} /></span><span><strong>{hub?.cinema.count ?? media.length}</strong><small>historias para compartir</small></span></div>
      <div><span className="home-stat-icon blue"><FolderOpen size={19} /></span><span><strong>{hub?.files.count ?? '—'}</strong><small>archivos en su lugar</small></span></div>
      <div><span className="home-stat-icon peach"><HardDrive size={19} /></span><span><strong>{hub ? bytes(free) : '—'}</strong><small>disponibles en disco</small></span></div>
      <button onClick={onNetwork}><span className="home-stat-icon"><Wifi size={19} /></span><span><strong>Tu red local</strong><small>invita a otras pantallas <ArrowUpRight size={11} /></small></span></button></div>

    <section className="home-sections" aria-labelledby="home-sections-title"><div className="section-heading"><div><span className="section-eyebrow">CADA PLAN TIENE SU ESPACIO</span><h2 id="home-sections-title">Tus rincones<span className="home-heading-star">✳</span></h2></div><span className="home-section-note">Una casa. Muchas posibilidades.</span></div>
      <div className="home-module-grid">{modules.map(module => { const Icon = icons[module.id as keyof typeof icons]; return <button key={module.id} className={`home-module module-${module.color}`} onClick={() => onNavigate(module.id as Section)}>
        <div className="module-card-top"><span className="module-icon"><Icon size={27} /></span><span className={`module-status ${module.status === 'planned' ? 'planned' : ''}`}>{module.status === 'active' ? 'Disponible' : 'Próxima etapa'}</span></div>
        <span className="module-eyebrow">{module.eyebrow}</span><h3>{module.name}<ArrowUpRight size={24} /></h3><p>{module.description}</p>
        <span className="module-card-bottom">{module.id === 'cinema' ? `${hub?.cinema.ready ?? movies.length} videos listos` : module.id === 'files' ? `${hub?.files.folders ?? 0} carpetas · documentos, fotos y más` : `${hub?.gaming?.count ?? 0} juegos · tu próxima aventura`}<ArrowRight size={17} /></span>
      </button>; })}</div></section>

    <div className="home-bottom-grid"><section className="home-activity"><div className="home-small-heading"><h3><Clock3 size={17} /> Lo último que llegó</h3><button onClick={() => onNavigate('files')}>Ver archivos <ArrowRight size={14} /></button></div>
      {hub?.recentFiles.length ? <div className="home-recent-files">{hub.recentFiles.map(file => <a href={file.downloadUrl} download key={file.id}><span className="recent-file-icon"><FileText size={20} /></span><span><strong>{file.title}{file.extension}</strong><small>{file.addedBy} · {day(file.createdAt)} · {bytes(file.size)}</small></span><Download size={16} /></a>)}</div>
        : <div className="home-recent-empty"><FolderOpen size={32} /><h4>Tu casa todavía tiene espacio.</h4><p>Trae ese documento o recuerdo que quieres tener a mano.</p><button onClick={() => onNavigate('files')}>Guardar mi primer archivo <ArrowUpRight size={14} /></button></div>}</section>
      <section className="home-disk"><div className="home-small-heading"><h3><HardDrive size={17} /> Disco del servidor</h3><span>{protectedAccess ? <ShieldCheck size={18} /> : <House size={18} />}</span></div><strong>{hub ? bytes(free) : 'Conectando…'}<span> libres</span></strong>
        <div className="home-disk-bar"><span style={{ width: `${total ? Math.min(100,hub!.storage.usedBytes / total * 100) : 0}%` }} /></div><p>{hub ? `${bytes(hub.storage.usedBytes)} utilizados de ${bytes(total)}` : 'Consultando espacio de tu PC.'}</p>
        <div className="home-disk-note"><Wifi size={17} /><span>Servidor guarda tus cosas en casa. Copia carpeta de datos a otro disco para tener respaldo.</span></div></section></div>
    <section className="home-cinema-strip"><div><span className="section-eyebrow">¿NOS PONEMOS CÓMODOS?</span><h3>Tu próxima función está aquí.</h3><button onClick={() => onNavigate('cinema')}>Entrar a Palomita <ArrowRight size={16} /></button></div>
      {movies.length ? <div className="home-cinema-picks">{movies.map(movie => <button key={movie.id} onClick={() => onPlay(movie.id)}>{movie.posterUrl ? <img src={movie.posterUrl} alt="" /> : <Film size={30} />}<span>{movie.title}</span></button>)}</div>
        : <button className="home-cinema-upload" onClick={onUpload}><Film size={32} /><span>Trae película para todos <ArrowUpRight size={16} /></span></button>}</section>
    <footer className="home-footer"><span>guarida<span>.</span> <small>Tu casa tiene su propio universo.</small></span><span>Hecho para crecer contigo <Sparkles size={14} /></span></footer>
  </div>;
}
