import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function createGameStore(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'gaming.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, system TEXT NOT NULL, region TEXT NOT NULL,
      originalName TEXT NOT NULL, extension TEXT NOT NULL, size INTEGER NOT NULL,
      addedBy TEXT NOT NULL, createdAt TEXT NOT NULL, sha256 TEXT NOT NULL, cover TEXT
    );
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bios (region TEXT PRIMARY KEY, filename TEXT NOT NULL, blob TEXT NOT NULL, md5 TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS saves (
      gameId TEXT REFERENCES games(id) ON DELETE CASCADE, playerId TEXT REFERENCES players(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, revision INTEGER NOT NULL, blob TEXT NOT NULL, size INTEGER NOT NULL, updatedAt TEXT NOT NULL,
      PRIMARY KEY (gameId,playerId,kind)
    );`);
  const get = db.prepare('SELECT * FROM games WHERE id=?');
  const list = db.prepare('SELECT * FROM games ORDER BY createdAt DESC,id');
  const add = db.prepare('INSERT INTO games (id,title,system,region,originalName,extension,size,addedBy,createdAt,sha256,cover) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const save = db.prepare('SELECT * FROM saves WHERE gameId=? AND playerId=? AND kind=?');
  return {
    list: () => list.all(), get: id => get.get(id),
    add: g => add.run(g.id,g.title,g.system,g.region,g.originalName,g.extension,g.size,g.addedBy,g.createdAt,g.sha256,g.cover),
    edit: (id,title,region) => db.prepare('UPDATE games SET title=?,region=? WHERE id=?').run(title,region,id),
    cover: (id,cover) => db.prepare('UPDATE games SET cover=? WHERE id=?').run(cover,id),
    remove: id => db.prepare('DELETE FROM games WHERE id=?').run(id),
    stats: () => db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM games').get(),
    players: () => db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE,id').all(),
    player: id => db.prepare('SELECT * FROM players WHERE id=?').get(id),
    addPlayer: p => db.prepare('INSERT INTO players (id,name,createdAt) VALUES (?,?,?)').run(p.id,p.name,p.createdAt),
    bios: () => db.prepare('SELECT * FROM bios ORDER BY region').all(),
    setBios: b => db.prepare('INSERT INTO bios (region,filename,blob,md5) VALUES (?,?,?,?) ON CONFLICT(region) DO UPDATE SET filename=excluded.filename,blob=excluded.blob,md5=excluded.md5').run(b.region,b.filename,b.blob,b.md5),
    save: (g,p,k) => save.get(g,p,k),
    saves: g => db.prepare('SELECT * FROM saves WHERE gameId=?').all(g),
    setSave(s,expected) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = save.get(s.gameId,s.playerId,s.kind);
        if ((current?.revision || 0) !== expected) { db.exec('ROLLBACK'); return false; }
        db.prepare(`INSERT INTO saves (gameId,playerId,kind,revision,blob,size,updatedAt) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(gameId,playerId,kind) DO UPDATE SET revision=excluded.revision,blob=excluded.blob,size=excluded.size,updatedAt=excluded.updatedAt`)
          .run(s.gameId,s.playerId,s.kind,expected+1,s.blob,s.size,s.updatedAt);
        db.exec('COMMIT'); return true;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}

export function publicGame(g) {
  return { ...g, coverUrl: g.cover ? `/api/gaming/games/${g.id}/cover?v=${g.cover}` : null,
    romUrl: `/api/gaming/games/${g.id}/rom/game${g.extension}`, downloadUrl: `/api/gaming/games/${g.id}/download` };
}
