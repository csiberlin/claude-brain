import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(): void {
  const dbPath = join(homedir(), ".claude", "knowledge.db");
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      project TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      title,
      content,
      tags,
      category,
      source,
      content='entries',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content, tags, category, source)
      VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
      VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
      VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
      INSERT INTO entries_fts(rowid, title, content, tags, category, source)
      VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
    END;

    CREATE TABLE IF NOT EXISTS embeddings (
      entry_id INTEGER PRIMARY KEY,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );
  `);

  // Migration: add access tracking columns
  const columns = db.pragma("table_info(entries)") as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));
  if (!colNames.has("last_accessed")) {
    db.exec("ALTER TABLE entries ADD COLUMN last_accessed TEXT DEFAULT NULL");
  }
  if (!colNames.has("access_count")) {
    db.exec(
      "ALTER TABLE entries ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!colNames.has("source")) {
    db.exec("ALTER TABLE entries ADD COLUMN source TEXT DEFAULT NULL");
  }
  if (!colNames.has("source_type")) {
    db.exec("ALTER TABLE entries ADD COLUMN source_type TEXT DEFAULT NULL");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.exec(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('consolidation_count', '0')`);

  const oldCategoryCount = db.prepare(
    `SELECT COUNT(*) as cnt FROM entries WHERE category IN ('debugging','config','architecture','general')`
  ).get() as { cnt: number };

  if (oldCategoryCount.cnt > 0) {
    db.exec(`UPDATE entries SET category = 'map' WHERE category = 'architecture'`);
    db.exec(`UPDATE entries SET category = 'pattern' WHERE category = 'debugging'`);
    db.exec(`UPDATE entries SET category = 'decision' WHERE category = 'config'`);
    db.exec(`UPDATE entries SET category = 'pattern' WHERE category = 'general'`);
  }

  // Rebuild FTS5 if it doesn't have the source column
  try {
    const ftsInfo = db.prepare("SELECT * FROM entries_fts LIMIT 0").columns();
    const ftsColNames = ftsInfo.map((c: { name: string }) => c.name);
    if (!ftsColNames.includes("source")) {
      db.exec("DROP TABLE IF EXISTS entries_fts");
      db.exec("DROP TRIGGER IF EXISTS entries_ai");
      db.exec("DROP TRIGGER IF EXISTS entries_ad");
      db.exec("DROP TRIGGER IF EXISTS entries_au");

      db.exec(`
        CREATE VIRTUAL TABLE entries_fts USING fts5(
          title,
          content,
          tags,
          category,
          source,
          content='entries',
          content_rowid='id',
          tokenize='porter unicode61'
        );

        CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
          INSERT INTO entries_fts(rowid, title, content, tags, category, source)
          VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
        END;

        CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
          INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
          VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
        END;

        CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
          INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
          VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
          INSERT INTO entries_fts(rowid, title, content, tags, category, source)
          VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
        END;
      `);

      // Repopulate FTS index from existing data
      db.exec(`
        INSERT INTO entries_fts(rowid, title, content, tags, category, source)
        SELECT id, title, content, tags, category, COALESCE(source, '') FROM entries
      `);
    }
  } catch {
    // FTS5 table doesn't exist yet or has issues — will be created by initial schema
  }
}
