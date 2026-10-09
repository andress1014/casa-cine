import { useEffect, useRef, useState } from 'react';
import { UploadCloud, File as FileOutline, X, CheckCircle2, LoaderCircle, AlertCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { bytes } from './types';

type Item = { file: File; title: string; progress: number; state: 'waiting' | 'uploading' | 'done' | 'error'; error?: string };
export function FileUpload({ maxBytes, extensions, name, folderId, folderName, onClose, onUploaded, notify }: {
  maxBytes: number; extensions: string[]; name: string; folderId: string | null; folderName: string;
  onClose: () => void; onUploaded: () => void; notify: (message: string) => void;
}) {
  const [items,setItems] = useState<Item[]>([]), [addedBy,setAddedBy] = useState(name), [busy,setBusy] = useState(false), [error,setError] = useState(''), [dragging,setDragging] = useState(false);
  const chooser = useRef<HTMLInputElement>(null), request = useRef<XMLHttpRequest | null>(null), cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; request.current?.abort(); },[]);
  function add(files: FileList | File[]) {
    const invalid: string[] = [], selected: Item[] = [];
    for (const file of Array.from(files)) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!extensions.includes(extension)) invalid.push(`${file.name}: formato no admitido.`);
      else if (!file.size || file.size > maxBytes) invalid.push(`${file.name}: vacío o supera ${bytes(maxBytes)}.`);
      else selected.push({ file, title: file.name.replace(/\.[^.]+$/,'').slice(0,160), progress: 0, state: 'waiting' });
    }
    setItems(previous => [...previous,...selected]); setError(invalid.join(' '));
  }
  function update(index: number, patch: Partial<Item>) { setItems(previous => previous.map((item,i) => i === index ? { ...item,...patch } : item)); }
  function send(item: Item,index: number) {
    return new Promise<void>((resolve,reject) => {
      const xhr = new XMLHttpRequest(); request.current = xhr; const body = new FormData();
      body.append('title',item.title.trim()); body.append('originalName',item.file.name); body.append('addedBy',addedBy.trim()); body.append('folderId',folderId || ''); body.append('file',item.file);
      xhr.open('POST','/api/files'); xhr.upload.onprogress = event => { if (event.lengthComputable) update(index,{ progress: Math.round(event.loaded / event.total * 100) }); };
      xhr.onload = () => {
        let result; try { result = JSON.parse(xhr.responseText); } catch { result = {}; }
        if (xhr.status >= 200 && xhr.status < 300) { update(index,{ state: 'done', progress: 100 }); onUploaded(); resolve(); }
        else { if (xhr.status === 401) window.dispatchEvent(new Event('casacine:unauthorized')); reject(new Error(result.error || 'No pudimos guardar archivo.')); }
      };
      xhr.onerror = () => reject(new Error('Conexión perdida. Vuelve a intentar.')); xhr.onabort = () => reject(new Error('Subida cancelada.')); xhr.send(body);
    });
  }
  async function start() {
    if (busy || !addedBy.trim() || items.some(item => item.state !== 'done' && !item.title.trim())) return;
    cancelled.current = false; setBusy(true); let saved = 0;
    for (let i = 0; i < items.length && !cancelled.current; i++) {
      if (items[i].state === 'done') continue; update(i,{ state: 'uploading',progress: 0,error: undefined });
      try { await send(items[i],i); saved++; } catch (problem) { update(i,{ state: 'error',error: problem instanceof Error ? problem.message : 'Subida falló.' }); }
    }
    request.current = null; setBusy(false); if (!cancelled.current) notify(saved ? `${saved} ${saved === 1 ? 'archivo guardado' : 'archivos guardados'} en casa.` : 'Revisa archivos pendientes y vuelve a intentar.');
  }
  function close() { if (busy && !window.confirm('¿Cancelar subida actual? Archivos guardados permanecen en casa.')) return; cancelled.current = true; request.current?.abort(); onClose(); }
  const missingTitle = items.some(item => item.state !== 'done' && !item.title.trim());
  return <Dialog title="Trae tus cosas a casa" onClose={close}><p className="dialog-intro">Guardaremos archivos en <strong>{folderName}</strong>. Disponibles para equipos de tu red local.</p>
    <button className={`dropzone file-dropzone ${dragging ? 'dragging' : ''}`} disabled={busy} onClick={() => chooser.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) add(event.dataTransfer.files); }}>
      <span className="drop-icon"><UploadCloud size={28} /></span><strong>Arrastra documentos, fotos o archivos</strong><span>o toca para elegir desde tu equipo</span><small>PDF, Office, texto, imágenes, ZIP/RAR/7z · hasta {bytes(maxBytes)}</small></button>
    <input ref={chooser} type="file" multiple accept={extensions.join(',')} hidden onChange={event => { if (event.target.files) add(event.target.files); event.target.value = ''; }} />
    {error && <p className="inline-error" role="alert">{error}</p>}<label className="form-label file-author">¿Quién lo trae?<input value={addedBy} maxLength={60} disabled={busy} placeholder="Tu nombre" onChange={event => setAddedBy(event.target.value.replace(/[\x00-\x1f]/g,''))} /></label>
    {!!items.length && <div className="upload-list">{items.map((item,index) => <div className="upload-item" key={`${item.file.name}-${index}`}><FileOutline size={22} /><div className="upload-item-main"><input aria-label={`Nombre de ${item.file.name}`} value={item.title} maxLength={160} disabled={busy || item.state === 'done'} onChange={event => update(index,{ title: event.target.value })} />
      <small>{bytes(item.file.size)} · {item.state === 'done' ? 'Guardado en casa' : item.state === 'uploading' ? item.progress === 100 ? 'Verificando y guardando…' : `Subiendo ${item.progress}%` : item.error || 'Listo para guardar'}</small>{item.state === 'uploading' && <div className="tiny-progress"><span style={{ width: `${item.progress}%` }} /></div>}</div>
      {item.state === 'done' ? <CheckCircle2 className="lime" size={21} /> : item.state === 'uploading' ? <LoaderCircle className="spin" size={21} /> : item.state === 'error' ? <AlertCircle className="coral" size={21} /> : <button className="icon-button" disabled={busy} aria-label={`Quitar ${item.file.name}`} onClick={() => setItems(previous => previous.filter((_,i) => i !== index))}><X size={17} /></button>}</div>)}</div>}
    {missingTitle && <p className="inline-error">Escribe nombre para cada archivo.</p>}<div className="dialog-footer"><span>{items.filter(item => item.state === 'done').length}/{items.length} guardados · archivos permanecen en PC servidor.</span>
      <button className="button primary" disabled={busy || missingTitle || !addedBy.trim() || !items.some(item => item.state !== 'done')} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="spin" /> : <UploadCloud size={17} />}{busy ? 'Guardando…' : 'Guardar archivos'}</button></div>
  </Dialog>;
}
