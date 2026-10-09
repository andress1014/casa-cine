import { useEffect, useRef, useState } from 'react';
import { Heart, Download, MonitorPlay, RotateCcw, Expand, PictureInPicture2, Pencil, Trash2, LoaderCircle, Check } from 'lucide-react';
import { Dialog } from './Dialog';
import { api, bytes, duration, categories, type Media, type Category, type WatchProgress } from './types';

export function Player({ media, saved, favourite, toggleFavourite, saveProgress, onClose, onChanged, onRemoved, notify }: {
  media: Media; saved?: WatchProgress[string]; favourite: boolean; toggleFavourite: () => void;
  saveProgress: (id: string, time: number, length: number) => void; onClose: () => void;
  onChanged: (m: Media) => void; onRemoved: (id: string) => void; notify: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const initialTime = useRef(saved?.time || 0);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(media.title);
  const [description, setDescription] = useState(media.description);
  const [category, setCategory] = useState<Category>(media.category);

  useEffect(() => {
    const element = video.current;
    return () => { if (element?.currentTime) saveProgress(media.id, element.currentTime, element.duration || media.duration); };
  }, [media.id, saveProgress, media.duration]);

  function record(force = false) {
    const element = video.current;
    if (!element) return;
    if (force || Date.now() - lastSaved.current > 3000) {
      lastSaved.current = Date.now(); saveProgress(media.id, element.currentTime, element.duration || media.duration);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const result = await api<{ media: Media }>(`/api/media/${media.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, addedBy: media.addedBy }) });
      onChanged(result.media); setEditing(false); notify('Cambios guardados.');
    } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`¿Eliminar “${media.title}” para toda la casa? Se borrarán video original y copia preparada de la PC.`)) return;
    setBusy(true);
    try { await api(`/api/media/${media.id}`, { method: 'DELETE' }); onRemoved(media.id); onClose(); notify('Video eliminado.'); }
    catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }

  return <Dialog title={media.title} onClose={onClose} wide>
    <div className="player-screen">
      {media.status === 'ready' && media.streamUrl ? <video ref={video} src={media.streamUrl} controls autoPlay playsInline preload="metadata"
        poster={media.posterUrl || undefined} onError={() => setFailed(true)}
        onLoadedMetadata={() => { const v = video.current!; if (initialTime.current > 5 && initialTime.current < v.duration * 0.95) v.currentTime = initialTime.current; }}
        onTimeUpdate={() => record()} onPause={() => record(true)} onEnded={() => record(true)} />
        : <div className="player-wait"><MonitorPlay size={52} /><h3>{media.status === 'error' ? 'Necesita otra toma' : 'Preparando la función'}</h3><p>{media.error || 'Adaptamos el video para que puedas verlo en cualquier pantalla.'}</p>{media.status === 'processing' && <><div className="player-progress"><span style={{ width: `${Math.max(4, media.progress)}%` }} /></div><small>{media.progress ? `${media.progress}%` : 'En cola o generando miniatura…'}</small></>}</div>}
    </div>
    {failed && <p className="inline-error" role="alert">Este navegador no pudo reproducir el video. Prueba otro navegador o descarga el original para abrirlo con VLC.</p>}
    <div className="player-info">
      <div className="player-meta"><span className="category-label">{media.category}</span><span>{duration(media.duration)}</span><span>{media.height >= 2160 ? '4K' : media.height >= 1080 ? '1080p' : media.height >= 720 ? '720p' : `${media.height}p`}</span><span>{bytes(media.size)}</span></div>
      <p>{media.description || 'Una historia más para compartir en casa.'}</p><small>Traído por {media.addedBy} · {new Date(media.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</small>
      <div className="player-actions">
        <button className={`button secondary ${favourite ? 'favourited' : ''}`} onClick={toggleFavourite}><Heart size={18} fill={favourite ? 'currentColor' : 'none'} /> {favourite ? 'En favoritos' : 'Guardar favorito'}</button>
        {media.status === 'ready' && <><button className="button secondary" onClick={() => { if (video.current) { video.current.currentTime = 0; void video.current.play().catch(() => {}); } }}><RotateCcw size={17} /> Desde el inicio</button>
          <button className="icon-button" title="Pantalla completa" aria-label="Pantalla completa" onClick={() => { const element = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null; if (element?.requestFullscreen) void element.requestFullscreen().catch(() => notify('Usa control de pantalla completa del reproductor.')); else element?.webkitEnterFullscreen?.(); }}><Expand size={20} /></button>
          {'pictureInPictureEnabled' in document && <button className="icon-button" title="Ventana flotante" aria-label="Ventana flotante" onClick={() => { if (video.current?.requestPictureInPicture) void video.current.requestPictureInPicture().catch(() => notify('Ventana flotante no disponible en este navegador.')); }}><PictureInPicture2 size={20} /></button>}</>}
        <a className="icon-button" href={media.downloadUrl} aria-label="Descargar original" title="Descargar original"><Download size={20} /></a>
        <button className="icon-button" aria-label="Editar información" title="Editar información" onClick={() => setEditing(!editing)}><Pencil size={18} /></button>
        {media.status !== 'processing' && <button className="icon-button danger" disabled={busy} title="Eliminar para toda la casa" aria-label="Eliminar video" onClick={() => void remove()}><Trash2 size={18} /></button>}
      </div>
      {media.status === 'error' && <button className="button primary" onClick={() => { void api<{ media: Media }>(`/api/media/${media.id}/retry`, { method: 'POST' }).then(result => onChanged(result.media)).catch(error => notify(error.message)); }}><RotateCcw size={17} /> Volver a preparar</button>}
      {editing && <form className="edit-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="form-label">Título<input required value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></label>
        <label className="form-label">Colección<select value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="form-label">Descripción<textarea value={description} maxLength={2000} rows={3} onChange={e => setDescription(e.target.value)} /></label>
        <button type="submit" className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} Guardar cambios</button>
      </form>}
    </div>
  </Dialog>;
}
