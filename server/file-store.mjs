import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function createFileStore(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'home.sqlite'));
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, parentId TEXT REFERENCES folders(id) ON DELETE RESTRICT,
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS folder_names ON folders(IFNULL(parentId, ''), name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, originalName TEXT NOT NULL,
      extension TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL,
      addedBy TEXT NOT NULL, createdAt TEXT NOT NULL, sha256 TEXT NOT NULL,
      folderId TEXT REFERENCES folders(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS files_folder ON files(folderId);
    CREATE INDEX IF NOT EXISTS files_created ON files(createdAt);`);
  const folderList = db.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE, id');
  const folderGet = db.prepare('SELECT * FROM folders WHERE id=?');
  const folderAdd = db.prepare('INSERT INTO folders (id,name,parentId,createdAt) VALUES (?,?,?,?)');
  const folderRename = db.prepare('UPDATE folders SET name=? WHERE id=?');
  const folderDelete = db.prepare('DELETE FROM folders WHERE id=?');
  const folderChildren = db.prepare('SELECT (SELECT COUNT(*) FROM folders WHERE parentId=?) + (SELECT COUNT(*) FROM files WHERE folderId=?) AS count');
  const fileGet = db.prepare('SELECT * FROM files WHERE id=?');
  const fileAdd = db.prepare('INSERT INTO files (id,title,originalName,extension,kind,size,addedBy,createdAt,sha256,folderId) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const fileEdit = db.prepare('UPDATE files SET title=?, folderId=? WHERE id=?');
  const fileDelete = db.prepare('DELETE FROM files WHERE id=?');
  const where = `WHERE (?=1 OR folderId IS ?) AND (?='' OR title LIKE ? ESCAPE '\\' OR originalName LIKE ? ESCAPE '\\' OR addedBy LIKE ? ESCAPE '\\') AND (?='all' OR kind=?)`;
  const fileList = db.prepare(`SELECT * FROM files ${where} ORDER BY createdAt DESC, id LIMIT ? OFFSET ?`);
  const fileCount = db.prepare(`SELECT COUNT(*) AS count FROM files ${where}`);
  const stats = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes FROM files');
  const recent = db.prepare('SELECT * FROM files ORDER BY createdAt DESC, id LIMIT 5');
  return {
    folders() { return folderList.all(); },
    folder(id) { return folderGet.get(id); },
    addFolder(f) { folderAdd.run(f.id,f.name,f.parentId,f.createdAt); },
    renameFolder(id,name) { folderRename.run(name,id); },
    removeFolder(id) { folderDelete.run(id); },
    childCount(id) { return folderChildren.get(id,id).count; },
    get(id) { return fileGet.get(id); },
    add(f) { fileAdd.run(f.id,f.title,f.originalName,f.extension,f.kind,f.size,f.addedBy,f.createdAt,f.sha256,f.folderId); },
    edit(id,title,folderId) { fileEdit.run(title,folderId,id); },
    remove(id) { fileDelete.run(id); },
    search({ folder, search, kind, offset, limit }) {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const params = [Number(folder === 'all'), folder === 'root' || folder === 'all' ? null : folder, search, pattern, pattern, pattern, kind, kind];
      return { files: fileList.all(...params,limit,offset).map(publicFile), total: fileCount.get(...params).count };
    },
    stats() { return { ...stats.get(), folders: folderList.all().length }; },
    recent() { return recent.all().map(publicFile); },
    close() { db.close(); },
  };
}

export function publicFile(file) { return { ...file, downloadUrl: `/api/files/${file.id}/download` }; }
