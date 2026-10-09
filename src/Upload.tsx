import { useEffect, useRef, useState, type DragEvent } from 'react';
import { UploadCloud, FileVideo, CheckCircle2, AlertCircle, LoaderCircle, X, ArrowUpRight } from 'lucide-react';
import { Dialog } from './Dialog';
import { bytes, categories, type Category, type Media } from './types';

type Item = { file: File; title: string; state: 'waiting' | 'uploading' | 'done' | 'error'; progress: number; error?: string };
const extensions = ['mp4','m4v','mov','webm','mkv','avi','mpeg','mpg','wmv','ts'];

export function Upload({ maxBytes, name, onClose, onUploaded, notify }: {
  maxBytes: number; name: string; onClose: () => void; onUploaded: (media: Media) => void; notify: (message: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState<Category>('Películas');
  const [addedBy, setAddedBy] = useState(name);
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const current = useRef<XMLHttpRequest | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; current.current?.abort(); }, []);
  const completed = items.filter(i => i.state === 'done').length;

  function add(files: FileList | File[]) {
    const selected: Item[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (!extensions.includes(file.name.split('.').pop()?.toLowerCase() || '')) errors.push(`${file.name}: formato no admitido.`);
      else if (!file.size) errors.push(`${file.name}: archivo vacío.`);
      else if (file.size > maxBytes) errors.push(`${file.name}: supera ${bytes(maxBytes)}.`);
      else selected.push({ file, title: file.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' '), state: 'waiting', progress: 0 });
    }
    setItems(previous => [...previous, ...selected]); setValidation(errors.join(' '));
  }
  function update(index: number, patch: Partial<Item>) {
    setItems(previous => previous.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function send(item: Item, index: number) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest(); current.current = xhr;
      const form = new FormData();
      form.append('title', item.title.trim() || item.file.name.replace(/\.[^.]+$/, ''));
      form.append('category', category); form.append('addedBy', addedBy.trim());
      form.append('description', description); form.append('video', item.file);
      xhr.open('POST', '/api/media');
      xhr.upload.onprogress = event => { if (event.lengthComputable) update(index, { progress: Math.round(event.loaded / event.total * 100) }); };
      xhr.onload = () => {
        let body; try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
        if (xhr.status >= 200 && xhr.status < 300) { update(index, { state: 'done', progress: 100 }); onUploaded(body.media); resolve(); }
        else {
          if (xhr.status === 401) window.dispatchEvent(new Event('casacine:unauthorized'));
          reject(new Error(body.error || 'No se pudo subir. Revisa conexión y espacio disponible.'));
        }
      };
      xhr.onerror = () => reject(new Error('Se perdió conexión con la PC. Puedes volver a intentar.'));
      xhr.onabort = () => reject(new Error('Subida cancelada.'));
      xhr.send(form);
    });
  }
  async function start() {
    if (busy || !addedBy.trim()) return;
    cancelled.current = false; setBusy(true);
    for (let i = 0; i < items.length; i++) {
      if (cancelled.current) break;
      if (items[i].state === 'done') continue;
      update(i, { state: 'uploading', progress: 0, error: undefined });
      try { await send(items[i], i); }
      catch (error) { update(i, { state: 'error', error: error instanceof Error ? error.message : 'No se pudo subir.' }); }
    }
    current.current = null; setBusy(false);
    if (!cancelled.current) notify('Subidas terminadas. Videos aparecerán cuando estén preparados.');
  }
  function close() {
    if (busy && !window.confirm('¿Cancelar subida actual y cerrar? Videos ya subidos seguirán guardados.')) return;
    cancelled.current = true; current.current?.abort(); onClose();
  }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); if (!busy) add(event.dataTransfer.files); }

  return <Dialog title="Trae algo para ver" onClose={close}>
    <p className="dialog-intro">Tu próximo maratón, ese viaje inolvidable o una película para todos. Aquí caben tus historias.</p>
    <button className={`dropzone ${dragging ? 'dragging' : ''}`} disabled={busy} onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <span className="drop-icon"><UploadCloud size={30} /></span><strong>Arrastra tus videos aquí</strong><span>o toca para elegir desde tu equipo</span>
      <small>MP4, MKV, MOV, AVI, WebM y más · Hasta {bytes(maxBytes)} por video</small>
    </button>
    <input ref={input} type="file" multiple accept={extensions.map(e => `.${e}`).join(',')} hidden onChange={event => { if (event.target.files) add(event.target.files); event.target.value = ''; }} />
    {validation && <p className="inline-error" role="alert">{validation}</p>}
    <div className="form-grid">
      <label>Colección<select value={category} disabled={busy} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>¿Quién lo trae?<input maxLength={60} value={addedBy} disabled={busy} onChange={e => setAddedBy(e.target.value.replace(/[\x00-\x1f]/g, ''))} placeholder="Tu nombre" /></label>
    </div>
    <label className="form-label">Una pequeña descripción <span>(opcional)</span><textarea maxLength={2000} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} placeholder="De qué va o por qué vale la pena verlo…" rows={2} /></label>
    {items.length > 0 && <div className="upload-list">{items.map((item, index) => <div className="upload-item" key={`${item.file.name}-${index}`}>
      <FileVideo size={22} /><div className="upload-item-main">
        <input aria-label={`Título de ${item.file.name}`} maxLength={160} disabled={busy || item.state === 'done'} value={item.title} onChange={e => update(index, { title: e.target.value })} />
        <small>{bytes(item.file.size)} · {item.state === 'done' ? 'Guardado. Preparando para reproducción.' : item.state === 'uploading' ? item.progress === 100 ? 'Verificando video…' : `Subiendo ${item.progress}%` : item.error || 'Listo para subir'}</small>
        {item.state === 'uploading' && <div className="tiny-progress"><span style={{ width: `${item.progress}%` }} /></div>}
      </div>{item.state === 'done' ? <CheckCircle2 className="lime" size={22} /> : item.state === 'uploading' ? <LoaderCircle className="spin" size={22} /> : item.state === 'error' ? <AlertCircle className="coral" size={22} /> : <button className="icon-button" aria-label={`Quitar ${item.file.name}`} disabled={busy} onClick={() => setItems(previous => previous.filter((_, i) => i !== index))}><X size={18} /></button>}
    </div>)}</div>}
    <div className="dialog-footer"><span>{items.length ? `${completed}/${items.length} guardados · ${bytes(items.reduce((total, item) => total + item.file.size, 0))}` : 'Tus archivos quedan en la PC de casa.'}</span>
      <button className="button primary" disabled={busy || !addedBy.trim() || !items.some(i => i.state !== 'done')} onClick={() => void start()}>{busy ? <><LoaderCircle size={18} className="spin" /> Subiendo…</> : <><UploadCloud size={18} /> {completed ? 'Subir pendientes' : 'Subir videos'}<ArrowUpRight size={17} /></>}</button></div>
  </Dialog>;
}
