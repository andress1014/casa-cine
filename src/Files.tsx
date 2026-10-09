import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FolderOpen, FolderPlus, UploadCloud, Search, X, ChevronRight, FileText, FileImage, Archive, Download, MoreHorizontal, Trash2, Check, LoaderCircle, RefreshCw, ChevronLeft, ArrowUpRight, FileSpreadsheet } from 'lucide-react';
import { api, bytes } from './types';
import { Dialog } from './Dialog';
import { FileUpload } from './FileUpload';
import { folderPath, type Folder, type HomeFile } from './home-types';

type Config = { maxUploadBytes: number; extensions: string[] };
type FolderAction = { id: string | null; name: string; parentId: string | null };
const limit = 60;
const kinds = [{ id: 'all', name: 'Todo' },{ id: 'document', name: 'Documentos' },{ id: 'image', name: 'Imágenes' },{ id: 'text', name: 'Texto y datos' },{ id: 'archive', name: 'Comprimidos' }];
export function FileIcon({ file, size = 25 }: { file: Pick<HomeFile,'kind' | 'extension'>; size?: number }) {
  const Icon = file.kind === 'image' ? FileImage : file.kind === 'archive' ? Archive : ['.xls','.xlsx','.ods','.csv'].includes(file.extension) ? FileSpreadsheet : FileText;
  return <Icon size={size} strokeWidth={1.65} />;
}

export function Files({ name, notify, onChanged }: { name: string; notify: (message: string) => void; onChanged: () => void }) {
  const [files,setFiles] = useState<HomeFile[]>([]), [folders,setFolders] = useState<Folder[]>([]), [folderId,setFolderId] = useState<string | null>(null);
  const [query,setQuery] = useState(''), [kind,setKind] = useState('all'), [total,setTotal] = useState(0), [page,setPage] = useState(0);
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [revision,setRevision] = useState(0), [config,setConfig] = useState<Config | null>(null);
  const [upload,setUpload] = useState(false), [folderAction,setFolderAction] = useState<FolderAction | null>(null), [editing,setEditing] = useState<HomeFile | null>(null), [busy,setBusy] = useState(false);
  const [editTitle,setEditTitle] = useState(''), [editFolder,setEditFolder] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void api<Config>('/api/files/config',{ signal: abort.signal }).then(setConfig).catch(() => { if (!abort.signal.aborted) setError('No pudimos cargar Archivos. Reintenta conexión con servidor.'); });
    return () => abort.abort();
  },[]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        api<{ folders: Folder[] }>('/api/folders',{ signal: abort.signal }),
        api<{ files: HomeFile[]; total: number }>('/api/files/search',{ method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: query.trim() ? 'all' : folderId || 'root', search: query.trim(), kind, offset: page * limit, limit }), signal: abort.signal }),
      ]).then(([tree,result]) => {
        if (abort.signal.aborted) return;
        setFolders(tree.folders); setFiles(result.files); setTotal(result.total); setError('');
        if (page > 0 && !result.files.length) setPage(previous => Math.max(0,previous-1));
      }).catch(problem => { if (!abort.signal.aborted) setError(problem.message || 'Conexión perdida.'); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    },query ? 250 : 0);
    return () => { clearTimeout(timer); abort.abort(); };
  },[folderId,query,kind,page,revision]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') setRevision(value => value+1); },10000); return () => clearInterval(timer); },[]);
  const breadcrumb = useMemo(() => {
    const path: Folder[] = []; let current = folderId;
    for (let i = 0; current && i < 12; i++) { const folder = folders.find(f => f.id === current); if (!folder) break; path.unshift(folder); current = folder.parentId; }
    return path;
  },[folderId,folders]);
  const children = query.trim() ? [] : folders.filter(folder => folder.parentId === folderId);
  function navigate(id: string | null) { setFolderId(id); setQuery(''); setPage(0); }
  function refresh() { setRevision(value => value+1); onChanged(); }
  function openFile(file: HomeFile) { setEditing(file); setEditTitle(file.title); setEditFolder(file.folderId || ''); }
  async function saveFolder(event: FormEvent) {
    event.preventDefault(); if (!folderAction || !folderAction.name.trim() || busy) return; setBusy(true);
    try {
      await api(folderAction.id ? `/api/folders/${folderAction.id}` : '/api/folders',{ method: folderAction.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folderAction.id ? { name: folderAction.name.trim() } : { name: folderAction.name.trim(), parentId: folderAction.parentId }) });
      setFolderAction(null); refresh(); notify('Carpeta guardada.');
    } catch (problem) { notify(problem instanceof Error ? problem.message : 'No pudimos guardar carpeta.'); } finally { setBusy(false); }
  }
  async function deleteFolder() {
    if (!folderAction?.id || busy || !window.confirm(`¿Eliminar carpeta “${folderAction.name}” para todos? Debe estar vacía.`)) return;
    setBusy(true);
    try { await api(`/api/folders/${folderAction.id}`,{ method: 'DELETE' }); setFolderAction(null); refresh(); notify('Carpeta eliminada.'); }
    catch (problem) { notify(problem instanceof Error ? problem.message : 'No pudimos eliminar carpeta.'); } finally { setBusy(false); }
  }
  async function saveFile(event: FormEvent) {
    event.preventDefault(); if (!editing || !editTitle.trim() || busy) return; setBusy(true);
    try {
      await api(`/api/files/${editing.id}`,{ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle.trim(), folderId: editFolder || null }) });
      setEditing(null); refresh(); notify('Archivo actualizado.');
    } catch (problem) { notify(problem instanceof Error ? problem.message : 'No pudimos guardar cambios.'); } finally { setBusy(false); }
  }
  async function deleteFile() {
    if (!editing || busy || !window.confirm(`¿Eliminar “${editing.title}${editing.extension}” de servidor para todos? No se puede deshacer.`)) return;
    setBusy(true);
    try { await api(`/api/files/${editing.id}`,{ method: 'DELETE' }); setEditing(null); refresh(); notify('Archivo eliminado.'); }
    catch (problem) { notify(problem instanceof Error ? problem.message : 'No pudimos eliminar archivo.'); } finally { setBusy(false); }
  }
  return <div className="files-page">
    <section className="files-welcome"><div><span className="section-eyebrow">CADA COSA EN SU RINCÓN</span><h1>Menos vueltas.<br />Más <span>orden</span>.</h1><p>Documentos, fotos y archivos que quieres tener cerca. Guardados en casa, disponibles desde tus pantallas.</p></div>
      <div className="files-welcome-art" aria-hidden="true"><FolderOpen size={112} strokeWidth={1} /><span><FileText size={37} /></span><span><FileImage size={33} /></span><i>✳</i></div></section>
    <section aria-label="Explorador de archivos"><div className="section-heading files-heading"><div><span className="section-eyebrow">TU ESTANTE COMPARTIDO</span><h2>Mis archivos</h2></div><div className="files-heading-actions">
      <button className="button secondary" onClick={() => setFolderAction({ id: null,name: '',parentId: folderId })}><FolderPlus size={17} /> Nueva carpeta</button>
      <button className="button primary" disabled={!config} onClick={() => setUpload(true)}><UploadCloud size={17} /> Subir archivos</button></div></div>
      <div className="files-breadcrumb"><button className={!folderId ? 'current' : ''} onClick={() => navigate(null)}><FolderOpen size={16} /> Mis archivos</button>{breadcrumb.map(folder => <span key={folder.id}><ChevronRight size={13} /><button className={folder.id === folderId ? 'current' : ''} onClick={() => navigate(folder.id)}>{folder.name}</button></span>)}<button className="icon-button files-refresh" onClick={refresh} aria-label="Actualizar archivos"><RefreshCw size={16} /></button></div>
      <div className="files-toolbar"><label className="search-field"><Search size={17} /><input value={query} maxLength={160} placeholder="Buscar en todos mis archivos…" aria-label="Buscar archivos" onChange={event => { setQuery(event.target.value); setPage(0); }} />{query && <button className="icon-button" aria-label="Limpiar búsqueda de archivos" onClick={() => { setQuery(''); setPage(0); }}><X size={16} /></button>}</label>
        <div className="files-kind-tabs" role="group" aria-label="Tipo de archivo">{kinds.map(value => <button key={value.id} aria-pressed={kind === value.id} className={kind === value.id ? 'active' : ''} onClick={() => { setKind(value.id); setPage(0); }}>{value.name}</button>)}</div></div>
      {error && <div className="connection-warning" role="alert">{error}<button onClick={() => { if (!config) window.location.reload(); else refresh(); }}>Reintentar</button></div>}
      {!!children.length && <div className="files-folder-grid">{children.map(folder => <article className="files-folder" key={folder.id}><button className="folder-open" aria-label={`Abrir carpeta ${folder.name}`} onClick={() => navigate(folder.id)}><FolderOpen size={29} /><span><strong>{folder.name}</strong><small>Abrir carpeta</small></span><ChevronRight size={17} /></button>
        <button className="icon-button" aria-label={`Opciones de carpeta ${folder.name}`} onClick={() => setFolderAction({ ...folder })}><MoreHorizontal size={18} /></button></article>)}</div>}
      <div className="files-list-heading"><span>{query.trim() ? 'RESULTADOS EN TODA BIBLIOTECA' : 'ARCHIVOS DE ESTA CARPETA'}</span><span>{total} {total === 1 ? 'archivo' : 'archivos'} {loading && <LoaderCircle size={13} className="spin" />}</span></div>
      {loading && !files.length ? <div className="files-loading" role="status"><LoaderCircle size={29} className="spin" /><span>Ordenando tu estante…</span></div> : files.length ? <div className="files-grid">{files.map(file => <article className={`file-card file-${file.kind}`} key={file.id}>
        <div className="file-card-top"><span className="file-type-icon"><FileIcon file={file} size={31} /></span><span className="file-extension">{file.extension.slice(1).toUpperCase()}</span><button className="icon-button" aria-label={`Detalles de ${file.title}${file.extension}`} onClick={() => openFile(file)}><MoreHorizontal size={19} /></button></div>
        <button className="file-card-title" onClick={() => openFile(file)} title={`${file.title}${file.extension}`}>{file.title}</button><p>{bytes(file.size)} · {new Date(file.createdAt).toLocaleDateString('es',{ day: 'numeric',month: 'short' })}</p>
        <span className="file-card-location"><FolderOpen size={12} /> {folderPath(file.folderId,folders)}</span><div className="file-card-bottom"><span title={file.addedBy}>{file.addedBy}</span><a href={file.downloadUrl} download aria-label={`Descargar ${file.title}${file.extension}`}><Download size={16} /> Descargar</a></div>
      </article>)}</div> : <div className="files-empty"><span><FolderOpen size={45} strokeWidth={1.4} /></span><h3>{query || kind !== 'all' ? 'Ese archivo todavía no aparece' : 'Un buen rincón empieza con tus cosas'}</h3><p>{query || kind !== 'all' ? 'Prueba otra búsqueda o cambia tipo de archivo.' : 'Guarda documentos, recuerdos y archivos. Crea carpetas para encontrar todo después.'}</p>
        {query || kind !== 'all' ? <button className="button secondary" onClick={() => { setQuery(''); setKind('all'); setPage(0); }}>Ver todos</button> : <button className="button secondary" disabled={!config} onClick={() => setUpload(true)}><UploadCloud size={17} /> Guardar mi primer archivo <ArrowUpRight size={15} /></button>}</div>}
      {total > limit && <div className="files-pagination"><button className="button secondary" disabled={page === 0 || loading} onClick={() => setPage(value => value-1)}><ChevronLeft size={16} /> Anterior</button><span>{page+1} / {Math.ceil(total / limit)}</span><button className="button secondary" disabled={(page+1)*limit >= total || loading} onClick={() => setPage(value => value+1)}>Siguiente <ChevronRight size={16} /></button></div>}
    </section><div className="files-footnote"><FolderOpen size={18} /><p>Archivos compartidos con casa. Cambiar nombre, mover o eliminar afecta biblioteca de todos; descargas conservan copia en tu dispositivo.</p></div>
    {upload && config && <FileUpload maxBytes={config.maxUploadBytes} extensions={config.extensions} name={name} folderId={folderId} folderName={folderPath(folderId,folders)} onClose={() => setUpload(false)} onUploaded={refresh} notify={notify} />}
    {folderAction && <Dialog title={folderAction.id ? 'Tu carpeta' : 'Un rincón nuevo'} onClose={() => { if (!busy) setFolderAction(null); }}><form onSubmit={event => void saveFolder(event)}><p className="dialog-intro">Dentro de {folderPath(folderAction.parentId,folders)}. Carpeta se comparte con casa.</p><label className="form-label">Nombre de carpeta<input autoFocus required maxLength={80} value={folderAction.name} disabled={busy} placeholder="Documentos, viajes, facturas…" onChange={event => setFolderAction(previous => previous ? { ...previous,name: event.target.value } : null)} /></label><div className="dialog-footer"><span>{folderAction.id ? 'Puedes borrar carpeta cuando esté vacía.' : 'Organiza a tu manera.'}</span><button className="button primary" disabled={busy || !folderAction.name.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Guardar</button></div></form>{folderAction.id && <button className="button secondary file-delete-button" disabled={busy} onClick={() => void deleteFolder()}><Trash2 size={16} /> Eliminar carpeta vacía</button>}</Dialog>}
    {editing && <Dialog title="Tu archivo" onClose={() => { if (!busy) setEditing(null); }}><div className={`file-details-icon file-${editing.kind}`}><FileIcon file={editing} size={34} /><span>{editing.extension.slice(1).toUpperCase()}</span></div><p className="dialog-intro">{editing.originalName}<br />{bytes(editing.size)} · Traído por {editing.addedBy} · {new Date(editing.createdAt).toLocaleDateString('es')}</p>
      <form onSubmit={event => void saveFile(event)}><label className="form-label">Nombre<input value={editTitle} required maxLength={160} disabled={busy} onChange={event => setEditTitle(event.target.value)} /></label><label className="form-label file-move-label">Guardar en<select value={editFolder} disabled={busy} onChange={event => setEditFolder(event.target.value)}><option value="">Mis archivos</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id,folders)}</option>)}</select></label>
        <div className="dialog-footer"><span>Extensión {editing.extension} se conserva.</span><button className="button primary" disabled={busy || !editTitle.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Guardar cambios</button></div></form>
      <div className="file-details-actions"><a className="button secondary" href={editing.downloadUrl} download><Download size={16} /> Descargar</a><button className="button secondary file-delete-button" disabled={busy} onClick={() => void deleteFile()}><Trash2 size={16} /> Eliminar de casa</button></div><details className="file-hash"><summary>Huella de archivo · SHA-256</summary><code>{editing.sha256}</code></details></Dialog>}
  </div>;
}
