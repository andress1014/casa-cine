import { useEffect, useState, type FormEvent } from 'react';
import { Search, LoaderCircle, ImagePlus, Film, Check } from 'lucide-react';
import { api, type Media } from './types';
import { movieTitleHint } from '../shared/movie-title.mjs';
type Match = { id: number; type: 'movie' | 'tv'; title: string; originalTitle: string; year: string; overview: string; posterUrl: string | null };
export function MovieMetadata({ media,onChanged,notify }: { media: Media; onChanged: (m: Media) => void; notify: (s: string) => void }) {
  const [config,setConfig] = useState<{ configured: boolean } | null>(null), [query,setQuery] = useState(() => movieTitleHint(media.title).title), [type,setType] = useState<'movie' | 'tv'>(media.category === 'Series' ? 'tv' : 'movie');
  const [year,setYear] = useState(() => movieTitleHint(media.title).year || ''), [results,setResults] = useState<Match[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [searched,setSearched] = useState(false);
  useEffect(() => { const abort = new AbortController(); void api<{ configured: boolean }>('/api/metadata/config',{ signal: abort.signal }).then(setConfig).catch(e => { if (!abort.signal.aborted) setError(e.message); }); return () => abort.abort(); },[]);
  async function search(e: FormEvent) { e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const r = await api<{ results: Match[] }>(`/api/media/${media.id}/identify`,{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ query: query.trim(),type,...(year ? { year } : {}) }) }); setResults(r.results); setSearched(true); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function apply(match: Match) { if (busy) return; setBusy(true); setError('');
    try { const r = await api<{ media: Media }>(`/api/media/${media.id}/artwork`,{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ id: match.id,type: match.type }) }); onChanged(r.media); notify('Ficha, carátula y fondo guardados en Windows. También disponibles en TV.'); setResults([]); setSearched(false); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="movie-identify"><div className="movie-identify-heading"><ImagePlus size={20} /><div><h3>{media.tmdbId ? 'Cambiar ficha' : 'Encuentra su carátula'}</h3><p>{media.tmdbId ? 'Carátula y fondo guardados. Puedes escoger otra ficha.' : 'Buscamos carátula automáticamente. Si falta o no coincide, escoge ficha correcta aquí.'}</p></div></div>
    {config?.configured ? <form className="movie-identify-form" onSubmit={e => void search(e)}><label>Título<input required maxLength={160} value={query} disabled={busy} onChange={e => setQuery(e.target.value)} /></label><label>Tipo<select value={type} disabled={busy} onChange={e => setType(e.target.value as 'movie' | 'tv')}><option value="movie">Película</option><option value="tv">Serie</option></select></label><label>Año opcional<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={year} disabled={busy} onChange={e => setYear(e.target.value.replace(/\D/g,''))} /></label><button className="button secondary" disabled={busy || !query.trim()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />} Buscar</button></form>
      : <p className="subtitle-note">{config ? 'Para activar búsqueda, configura TMDB_READ_ACCESS_TOKEN en .env de Windows y reinicia servidor. Mientras tanto usamos imagen extraída de video.' : 'Consultando búsqueda de carátulas…'}</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}{searched && !results.length && <p className="subtitle-note">No hay coincidencias. Prueba título original o año.</p>}
    {results.length > 0 && <div className="movie-match-grid">{results.map(r => <button type="button" className="movie-match" key={`${r.type}-${r.id}`} disabled={busy} onClick={() => void apply(r)}>{r.posterUrl ? <img src={r.posterUrl} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="movie-match-placeholder"><Film size={24} /></span>}<span><strong>{r.title}</strong><small>{r.year || 'Año desconocido'} · {r.type === 'tv' ? 'Serie' : 'Película'}</small><small>{r.overview.slice(0,120)}</small><em><Check size={13} /> Usar esta ficha</em></span></button>)}</div>}
    {media.tmdbId && <button className="button secondary" disabled={busy} onClick={() => { void api<{ media: Media }>(`/api/media/${media.id}/artwork`,{ method: 'DELETE' }).then(r => { onChanged(r.media); notify('Volvimos a imagen del archivo de video.'); }).catch(e => notify(e.message)); }}>Usar imagen del video</button>}
  </section>;
}
