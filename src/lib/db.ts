import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false>;

export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export async function bootstrapSchema(): Promise<void> {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      strokes_json TEXT NOT NULL DEFAULT '[]',
      text_content TEXT NOT NULL DEFAULT '',
      pdf_url TEXT,
      pdf_page INTEGER,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      UNIQUE(notebook_id, page_number)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS ai_cards (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      notebook_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      diagram_type TEXT NOT NULL DEFAULT 'none',
      diagram_data TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_cards_page ON ai_cards(page_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_cards_notebook ON ai_cards(notebook_id)`;
}
