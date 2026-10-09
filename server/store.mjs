import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function createStore(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'library.sqlite'));
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, addedBy TEXT NOT NULL, originalName TEXT NOT NULL,
      extension TEXT NOT NULL, size INTEGER NOT NULL, createdAt TEXT NOT NULL,
      duration REAL NOT NULL DEFAULT 0, width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'processing',
      progress INTEGER NOT NULL DEFAULT 0, error TEXT, playable TEXT,
      poster INTEGER NOT NULL DEFAULT 0, videoCodec TEXT NOT NULL DEFAULT '',
      audioCodec TEXT NOT NULL DEFAULT '', pixelFormat TEXT NOT NULL DEFAULT ''
    );`);
  const columns = new Set(db.prepare('PRAGMA table_info(media)').all().map(c => c.name));
  for (const [name,definition] of Object.entries({ subtitleTracks: "TEXT NOT NULL DEFAULT '[]'", subtitleWarnings: "TEXT NOT NULL DEFAULT '[]'", posterSource: 'TEXT', posterVersion: 'INTEGER NOT NULL DEFAULT 0', metadataVersion: 'INTEGER NOT NULL DEFAULT 0',
    artworkPoster: 'TEXT', artworkBackdrop: 'TEXT',tmdbId: 'INTEGER',tmdbType: 'TEXT',releaseYear: 'TEXT',genres: "TEXT NOT NULL DEFAULT '[]'",
    artworkChoice: "TEXT NOT NULL DEFAULT 'auto'",artworkLookupKey: 'TEXT',artworkLookupAt: 'INTEGER NOT NULL DEFAULT 0' })) {
    if (!columns.has(name)) db.exec(`ALTER TABLE media ADD COLUMN ${name} ${definition}`);
  }
  const extras = db.prepare('UPDATE media SET subtitleTracks=?,subtitleWarnings=?,posterSource=?,posterVersion=posterVersion+1,metadataVersion=1 WHERE id=?');
  const insert = db.prepare(`INSERT INTO media
    (id,title,description,category,addedBy,originalName,extension,size,createdAt,duration,width,height,videoCodec,audioCodec,pixelFormat)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const list = db.prepare('SELECT * FROM media ORDER BY createdAt DESC, id');
  const find = db.prepare('SELECT * FROM media WHERE id = ?');
  const updateState = db.prepare('UPDATE media SET status=?,progress=?,error=?,playable=?,poster=? WHERE id=?');
  const updateMetadata = db.prepare('UPDATE media SET title=?,description=?,category=?,addedBy=? WHERE id=?');
  const remove = db.prepare('DELETE FROM media WHERE id=?');
  return {
    add(m) { insert.run(m.id,m.title,m.description,m.category,m.addedBy,m.originalName,m.extension,m.size,m.createdAt,m.duration,m.width,m.height,m.videoCodec,m.audioCodec,m.pixelFormat); },
    list() { return list.all(); },
    get(id) { return find.get(id); },
    state(id, state) {
      const m = find.get(id);
      if (m) updateState.run(state.status ?? m.status, state.progress ?? m.progress,
        state.error === undefined ? m.error : state.error, state.playable ?? m.playable,
        state.poster === undefined ? m.poster : Number(state.poster), id);
    },
    extras(id, tracks, warnings, posterSource) { extras.run(JSON.stringify(tracks),JSON.stringify(warnings),posterSource,id); },
    edit(id, m) { updateMetadata.run(m.title,m.description,m.category,m.addedBy,id); },
    artwork(id,m) { db.prepare('UPDATE media SET artworkPoster=?,artworkBackdrop=?,tmdbId=?,tmdbType=?,releaseYear=?,genres=?,title=?,description=?,artworkChoice=?,posterVersion=posterVersion+1 WHERE id=?')
      .run(m.poster,m.backdrop,m.tmdbId,m.tmdbType,m.releaseYear,JSON.stringify(m.genres),m.title,m.description,m.choice || 'manual',id); },
    artworkAttempt(id,key,at = Date.now()) { db.prepare('UPDATE media SET artworkLookupKey=?,artworkLookupAt=? WHERE id=?').run(key,at,id); },
    clearArtwork(id) { db.prepare("UPDATE media SET artworkPoster=NULL,artworkBackdrop=NULL,tmdbId=NULL,tmdbType=NULL,releaseYear=NULL,genres='[]',artworkChoice='video',posterVersion=posterVersion+1 WHERE id=?").run(id); },
    remove(id) { remove.run(id); },
    close() { db.close(); },
  };
}

export function publicMedia(m) {
  const { extension, playable, poster, subtitleTracks, subtitleWarnings, metadataVersion, artworkPoster,artworkBackdrop,genres,artworkChoice,artworkLookupKey,artworkLookupAt, ...metadata } = m;
  return { ...metadata, subtitles: JSON.parse(subtitleTracks || '[]').map(track => ({ ...track, url: `/api/media/${m.id}/subtitles/${track.id}` })), subtitleWarnings: JSON.parse(subtitleWarnings || '[]'), format: extension.slice(1).toUpperCase(),
    posterSource: artworkPoster ? 'tmdb' : m.posterSource,
    genres: JSON.parse(genres || '[]'),
    posterUrl: poster || artworkPoster ? `/api/media/${m.id}/poster?v=${m.posterVersion || 0}` : null,
    backdropUrl: artworkBackdrop ? `/api/media/${m.id}/backdrop?v=${m.posterVersion || 0}` : null,
    streamUrl: m.status === 'ready' ? `/api/media/${m.id}/stream` : null,
    downloadUrl: `/api/media/${m.id}/download` };
}
