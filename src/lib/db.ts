import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve("./synapse.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    bootstrap(db);
  }
  return db;
}

function bootstrap(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      strokes_json TEXT NOT NULL DEFAULT '[]',
      text_content TEXT NOT NULL DEFAULT '',
      pdf_url TEXT,
      pdf_page INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(notebook_id, page_number)
    );

    CREATE TABLE IF NOT EXISTS ai_cards (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      notebook_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      diagram_type TEXT NOT NULL DEFAULT 'none',
      diagram_data TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id);
    CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_cards_page ON ai_cards(page_id);
    CREATE INDEX IF NOT EXISTS idx_cards_notebook ON ai_cards(notebook_id);
  `);
}
