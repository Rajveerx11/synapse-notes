import { Pool } from "pg";
import { neon } from "@neondatabase/serverless";
import { User, Notebook, Page, AiCard, PdfAnnotation, Tag, Folder, LectureSummary } from "./types";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

// Storage path for fallback mode (/tmp on Vercel serverless or local dir)
const FALLBACK_DB_PATH = process.env.VERCEL
  ? "/tmp/synapse-db.json"
  : path.resolve("./synapse-db.json");

interface FallbackData {
  users: User[];
  notebooks: Notebook[];
  pages: Page[];
  ai_cards: AiCard[];
  pdf_annotations?: PdfAnnotation[];
  tags?: Tag[];
  folders?: Folder[];
  notebook_tags?: { notebook_id: string; tag_id: string }[];
  lecture_summaries?: LectureSummary[];
}

function loadFallbackData(): FallbackData {
  try {
    if (fs.existsSync(FALLBACK_DB_PATH)) {
      const raw = fs.readFileSync(FALLBACK_DB_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Fallback DB read error:", e);
  }
  return { users: [], notebooks: [], pages: [], ai_cards: [], pdf_annotations: [] };
}

function saveFallbackData(data: FallbackData): void {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("Fallback DB write error:", e);
  }
}

let pgPool: Pool | null = null;
let neonSql: ReturnType<typeof neon> | null = null;
let schemaInitialized = false;

function isNeonUrl(dbUrl: string): boolean {
  try {
    return new URL(dbUrl).hostname.toLowerCase().endsWith(".neon.tech");
  } catch {
    return false;
  }
}

// Query executor supporting Neon, Supabase, and any standard PostgreSQL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryDb<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("NO_DATABASE_URL");

  // Neon recommends its HTTP transport for one-shot/serverless queries. It
  // avoids a TCP/TLS connection setup on every isolated Next.js route.
  if (isNeonUrl(dbUrl)) {
    neonSql ||= neon(dbUrl);
    const rows = await neonSql.query(queryText, params);
    return rows as T[];
  }

  if (!pgPool) {
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }

  const client = await pgPool.connect();
  try {
    const res = await client.query(queryText, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function bootstrapSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || schemaInitialized) return;

  try {
    await queryDb(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);
    await queryDb(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);
    await queryDb(`
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
    `);
    await queryDb(`
      CREATE TABLE IF NOT EXISTS ai_cards (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        notebook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        diagram_type TEXT NOT NULL DEFAULT 'none',
        diagram_data TEXT NOT NULL DEFAULT '',
        interval_days INTEGER DEFAULT 0,
        ease_factor REAL DEFAULT 2.5,
        repetitions INTEGER DEFAULT 0,
        next_review_at BIGINT DEFAULT 0,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);
    try {
      await queryDb(`ALTER TABLE ai_cards ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0`);
      await queryDb(`ALTER TABLE ai_cards ADD COLUMN IF NOT EXISTS ease_factor REAL DEFAULT 2.5`);
      await queryDb(`ALTER TABLE ai_cards ADD COLUMN IF NOT EXISTS repetitions INTEGER DEFAULT 0`);
      await queryDb(`ALTER TABLE ai_cards ADD COLUMN IF NOT EXISTS next_review_at BIGINT DEFAULT 0`);
    } catch (e) {
      // Columns may already exist
    }

    await queryDb(`
      CREATE TABLE IF NOT EXISTS pdf_annotations (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL,
        type TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        color TEXT NOT NULL,
        text TEXT DEFAULT '',
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    await queryDb(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        UNIQUE(user_id, name)
      )
    `);

    await queryDb(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    await queryDb(`
      CREATE TABLE IF NOT EXISTS notebook_tags (
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (notebook_id, tag_id)
      )
    `);

    try {
      await queryDb(`ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL`);
      await queryDb(`ALTER TABLE pages ADD COLUMN IF NOT EXISTS code_content TEXT DEFAULT ''`);
      await queryDb(`ALTER TABLE pages ADD COLUMN IF NOT EXISTS code_language TEXT DEFAULT 'python'`);
      await queryDb(`ALTER TABLE pages ADD COLUMN IF NOT EXISTS code_line_height REAL DEFAULT 2.4`);
    } catch (e) {
      // Columns may already exist
    }

    await queryDb(`
      CREATE TABLE IF NOT EXISTS lecture_summaries (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        key_concepts JSONB NOT NULL DEFAULT '[]',
        definitions JSONB NOT NULL DEFAULT '{}',
        follow_up_questions JSONB NOT NULL DEFAULT '[]',
        raw_text TEXT NOT NULL DEFAULT '',
        model_used TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    schemaInitialized = true;
  } catch (e) {
    console.warn("Schema bootstrap warning:", e);
  }
}

export const dbService = {
  async findUserByUsername(username: string): Promise<User | null> {
    const cleanUsername = username.trim().toLowerCase();
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        const rows = await queryDb<User>(
          `SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
          [cleanUsername]
        );
        return rows[0] || null;
      } catch (e) {
        console.warn("Postgres query error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    return data.users.find((u) => u.username.toLowerCase() === cleanUsername) || null;
  },

  async createUser(id: string, username: string, passwordHash: string): Promise<User> {
    const now = Math.floor(Date.now() / 1000);
    const cleanUsername = username.trim();
    const user: User = { id, username: cleanUsername, password_hash: passwordHash, created_at: now };

    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        await queryDb(
          `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
          [id, cleanUsername, passwordHash]
        );
        return user;
      } catch (e) {
        console.warn("Postgres insert user error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    data.users.push(user);
    saveFallbackData(data);
    return user;
  },

  async listNotebooks(userId: string): Promise<Notebook[]> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        const rows = await queryDb<Notebook>(
          `SELECT n.*, COUNT(p.id)::int as page_count
           FROM notebooks n
           LEFT JOIN pages p ON p.notebook_id = n.id
           WHERE n.user_id = $1
           GROUP BY n.id
           ORDER BY n.updated_at DESC`,
          [userId]
        );
        return rows;
      } catch (e) {
        console.warn("Postgres listNotebooks error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    return data.notebooks
      .filter((n) => n.user_id === userId)
      .map((n) => ({
        ...n,
        page_count: data.pages.filter((p) => p.notebook_id === n.id).length,
      }))
      .sort((a, b) => b.updated_at - a.updated_at);
  },

  async getNotebook(id: string, userId: string): Promise<{ notebook: Notebook; pages: Page[] } | null> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        const nbs = await queryDb<Notebook>(
          `SELECT * FROM notebooks WHERE id = $1 AND (user_id = $2 OR $2 = 'mcp')`,
          [id, userId]
        );
        if (nbs.length > 0) {
          const pages = await queryDb<Page>(
            `SELECT * FROM pages WHERE notebook_id = $1 ORDER BY page_number`,
            [id]
          );
          return { notebook: nbs[0], pages };
        }
      } catch (e) {
        console.warn("Postgres getNotebook error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const nb = data.notebooks.find((n) => n.id === id && (n.user_id === userId || userId === "mcp"));
    if (!nb) return null;
    const pages = data.pages
      .filter((p) => p.notebook_id === id)
      .sort((a, b) => a.page_number - b.page_number);
    return { notebook: nb, pages };
  },

  async getNotebookOwner(id: string): Promise<string | null> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        const rows = await queryDb<{ user_id: string }>(
          `SELECT user_id FROM notebooks WHERE id = $1 LIMIT 1`,
          [id]
        );
        if (rows.length > 0) return rows[0].user_id;
      } catch (e) {
        console.warn("Postgres getNotebookOwner error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    const nb = data.notebooks.find((n) => n.id === id);
    return nb ? nb.user_id : null;
  },

  async ensureNotebook(
    id: string,
    userId: string,
    title: string = "Untitled Notebook",
    subject: string = ""
  ): Promise<{ notebook: Notebook; pages: Page[] } | null> {
    const existing = await this.getNotebook(id, userId);
    if (existing) return existing;

    const owner = await this.getNotebookOwner(id);
    if (owner && owner !== userId && userId !== "mcp") {
      return null;
    }

    const created = await this.createNotebook(id, userId, title, subject);
    const pages = await this.listPages(id, userId);
    return { notebook: created, pages };
  },

  async createNotebook(id: string, userId: string, title: string, subject: string): Promise<Notebook> {
    const now = Math.floor(Date.now() / 1000);
    const nb: Notebook = {
      id,
      user_id: userId,
      title,
      subject: subject || "",
      created_at: now,
      updated_at: now,
      page_count: 1,
    };

    const firstPage: Page = {
      id: uuid(),
      notebook_id: id,
      page_number: 1,
      strokes_json: "[]",
      text_content: "",
      pdf_url: null,
      pdf_page: null,
      updated_at: now,
    };

    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        await queryDb(
          `WITH inserted_notebook AS (
             INSERT INTO notebooks (id, user_id, title, subject, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id
           )
           INSERT INTO pages (id, notebook_id, page_number)
           SELECT $7, id, 1 FROM inserted_notebook`,
          [id, userId, title, subject || "", now, now, firstPage.id]
        );
        return nb;
      } catch (e) {
        console.warn("Postgres createNotebook error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    data.notebooks.unshift(nb);
    data.pages.push(firstPage);
    saveFallbackData(data);
    return nb;
  },

  async updateNotebook(id: string, userId: string, title?: string, subject?: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(
          `UPDATE notebooks SET
            title = COALESCE($1, title),
            subject = COALESCE($2, subject),
            updated_at = $3
           WHERE id = $4 AND user_id = $5`,
          [title ?? null, subject ?? null, now, id, userId]
        );
        return true;
      } catch (e) {
        console.warn("Postgres updateNotebook error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const nb = data.notebooks.find((n) => n.id === id && n.user_id === userId);
    if (!nb) return false;
    if (title !== undefined) nb.title = title;
    if (subject !== undefined) nb.subject = subject;
    nb.updated_at = now;
    saveFallbackData(data);
    return true;
  },

  async deleteNotebook(id: string, userId: string): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM notebooks WHERE id = $1 AND user_id = $2`, [id, userId]);
        return true;
      } catch (e) {
        console.warn("Postgres deleteNotebook error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    data.notebooks = data.notebooks.filter((n) => !(n.id === id && n.user_id === userId));
    data.pages = data.pages.filter((p) => p.notebook_id !== id);
    data.ai_cards = data.ai_cards.filter((c) => c.notebook_id !== id);
    saveFallbackData(data);
    return true;
  },

  async listPages(notebookId: string, userId: string): Promise<Page[]> {
    if (process.env.DATABASE_URL) {
      try {
        const pages = await queryDb<Page>(
          `SELECT * FROM pages WHERE notebook_id = $1 ORDER BY page_number`,
          [notebookId]
        );
        return pages;
      } catch (e) {
        console.warn("Postgres listPages error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    return data.pages
      .filter((p) => p.notebook_id === notebookId)
      .sort((a, b) => a.page_number - b.page_number);
  },

  async upsertPage(
    notebookId: string,
    pageNumber: number,
    update: {
      strokes_json?: string;
      text_content?: string;
      pdf_url?: string | null;
      pdf_page?: number | null;
      code_content?: string;
      code_language?: string;
      code_line_height?: number;
    }
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (process.env.DATABASE_URL) {
      try {
        const pageId = uuid();
        const rows = await queryDb<{ id: string }>(
          `WITH upserted AS (
             INSERT INTO pages (
               id, notebook_id, page_number, strokes_json, text_content,
               pdf_url, pdf_page, code_content, code_language, code_line_height, updated_at
             )
             VALUES (
               $1, $2, $3, COALESCE($4, '[]'), COALESCE($5, ''),
               $6, $7, COALESCE($8, ''), COALESCE($9, 'python'), COALESCE($10, 2.4), $11
             )
             ON CONFLICT (notebook_id, page_number) DO UPDATE SET
               strokes_json = COALESCE($4, pages.strokes_json),
               text_content = COALESCE($5, pages.text_content),
               pdf_url = COALESCE($6, pages.pdf_url),
               pdf_page = COALESCE($7, pages.pdf_page),
               code_content = COALESCE($8, pages.code_content),
               code_language = COALESCE($9, pages.code_language),
               code_line_height = COALESCE($10, pages.code_line_height),
               updated_at = $11
             RETURNING id
           ), propagated_pdf AS (
             UPDATE pages SET pdf_url = $6
             WHERE notebook_id = $2 AND page_number <> $3 AND $6::text IS NOT NULL
           ), touched_notebook AS (
             UPDATE notebooks SET updated_at = $11 WHERE id = $2
           )
           SELECT id FROM upserted`,
          [
            pageId,
            notebookId,
            pageNumber,
            update.strokes_json ?? null,
            update.text_content ?? null,
            update.pdf_url ?? null,
            update.pdf_page ?? null,
            update.code_content ?? null,
            update.code_language ?? null,
            update.code_line_height ?? null,
            now,
          ]
        );
        return rows[0].id;
      } catch (e) {
        console.warn("Postgres upsertPage error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    let page = data.pages.find((p) => p.notebook_id === notebookId && p.page_number === pageNumber);
    if (page) {
      if (update.strokes_json !== undefined) page.strokes_json = update.strokes_json;
      if (update.text_content !== undefined) page.text_content = update.text_content;
      if (update.pdf_url !== undefined) page.pdf_url = update.pdf_url;
      if (update.pdf_page !== undefined) page.pdf_page = update.pdf_page;
      if (update.code_content !== undefined) page.code_content = update.code_content;
      if (update.code_language !== undefined) page.code_language = update.code_language;
      if (update.code_line_height !== undefined) page.code_line_height = update.code_line_height;
      page.updated_at = now;
    } else {
      page = {
        id: uuid(),
        notebook_id: notebookId,
        page_number: pageNumber,
        strokes_json: update.strokes_json ?? "[]",
        text_content: update.text_content ?? "",
        pdf_url: update.pdf_url ?? null,
        pdf_page: update.pdf_page ?? null,
        code_content: update.code_content ?? "",
        code_language: update.code_language ?? "python",
        code_line_height: update.code_line_height ?? 2.4,
        updated_at: now,
      };
      data.pages.push(page);
    }
    const nb = data.notebooks.find((n) => n.id === notebookId);
    if (nb) nb.updated_at = now;
    saveFallbackData(data);
    return page.id;
  },

  async listAiCards(notebookId: string, pageNumber?: number): Promise<AiCard[]> {
    if (process.env.DATABASE_URL) {
      try {
        if (pageNumber) {
          const cards = await queryDb<AiCard>(
            `SELECT ac.* FROM ai_cards ac
             JOIN pages p ON p.id = ac.page_id
             WHERE ac.notebook_id = $1 AND p.page_number = $2
             ORDER BY ac.created_at DESC`,
            [notebookId, pageNumber]
          );
          return cards;
        } else {
          const cards = await queryDb<AiCard>(
            `SELECT * FROM ai_cards WHERE notebook_id = $1 ORDER BY created_at DESC`,
            [notebookId]
          );
          return cards;
        }
      } catch (e) {
        console.warn("Postgres listAiCards error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (pageNumber) {
      const page = data.pages.find((p) => p.notebook_id === notebookId && p.page_number === pageNumber);
      if (!page) return [];
      return data.ai_cards.filter((c) => c.page_id === page.id).sort((a, b) => b.created_at - a.created_at);
    }
    return data.ai_cards.filter((c) => c.notebook_id === notebookId).sort((a, b) => b.created_at - a.created_at);
  },

  async createAiCard(cardInput: {
    notebookId: string;
    pageNumber: number;
    title: string;
    content: string;
    diagramType?: "none" | "mermaid" | "flowchart";
    diagramData?: string;
  }): Promise<AiCard> {
    const cardId = uuid();
    const now = Math.floor(Date.now() / 1000);

    if (process.env.DATABASE_URL) {
      try {
        let pageRows = await queryDb<{ id: string }>(
          `SELECT id FROM pages WHERE notebook_id = $1 AND page_number = $2`,
          [cardInput.notebookId, cardInput.pageNumber]
        );
        let pageId = pageRows[0]?.id;
        if (!pageId) {
          pageId = uuid();
          await queryDb(
            `INSERT INTO pages (id, notebook_id, page_number) VALUES ($1, $2, $3)`,
            [pageId, cardInput.notebookId, cardInput.pageNumber]
          );
        }
        await queryDb(
          `INSERT INTO ai_cards (id, page_id, notebook_id, title, content, diagram_type, diagram_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            cardId,
            pageId,
            cardInput.notebookId,
            cardInput.title,
            cardInput.content,
            cardInput.diagramType ?? "none",
            cardInput.diagramData ?? "",
            now,
          ]
        );
        await queryDb(`UPDATE notebooks SET updated_at = $1 WHERE id = $2`, [now, cardInput.notebookId]);
        const cardRows = await queryDb<AiCard>(`SELECT * FROM ai_cards WHERE id = $1`, [cardId]);
        return cardRows[0];
      } catch (e) {
        console.warn("Postgres createAiCard error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    let page = data.pages.find((p) => p.notebook_id === cardInput.notebookId && p.page_number === cardInput.pageNumber);
    if (!page) {
      page = {
        id: uuid(),
        notebook_id: cardInput.notebookId,
        page_number: cardInput.pageNumber,
        strokes_json: "[]",
        text_content: "",
        pdf_url: null,
        pdf_page: null,
        updated_at: now,
      };
      data.pages.push(page);
    }
    const card: AiCard = {
      id: cardId,
      page_id: page.id,
      notebook_id: cardInput.notebookId,
      title: cardInput.title,
      content: cardInput.content,
      diagram_type: cardInput.diagramType ?? "none",
      diagram_data: cardInput.diagramData ?? "",
      created_at: now,
    };
    data.ai_cards.unshift(card);
    const nb = data.notebooks.find((n) => n.id === cardInput.notebookId);
    if (nb) nb.updated_at = now;
    saveFallbackData(data);
    return card;
  },

  async updateCardReview(
    cardId: string,
    srs: {
      intervalDays: number;
      easeFactor: number;
      repetitions: number;
      nextReviewAt: number;
    }
  ): Promise<void> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(
          `UPDATE ai_cards SET
            interval_days = $1,
            ease_factor = $2,
            repetitions = $3,
            next_review_at = $4
           WHERE id = $5`,
          [srs.intervalDays, srs.easeFactor, srs.repetitions, srs.nextReviewAt, cardId]
        );
        return;
      } catch (e) {
        console.warn("Postgres updateCardReview error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const card = data.ai_cards.find((c) => c.id === cardId);
    if (card) {
      card.interval_days = srs.intervalDays;
      card.ease_factor = srs.easeFactor;
      card.repetitions = srs.repetitions;
      card.next_review_at = srs.nextReviewAt;
      saveFallbackData(data);
    }
  },

  async listDueCards(userId: string, notebookId?: string): Promise<AiCard[]> {
    const now = Math.floor(Date.now() / 1000);

    if (process.env.DATABASE_URL) {
      try {
        if (notebookId) {
          const rows = await queryDb<AiCard>(
            `SELECT ac.* FROM ai_cards ac
             JOIN notebooks n ON n.id = ac.notebook_id
             WHERE n.user_id = $1 AND ac.notebook_id = $2
               AND (ac.next_review_at IS NULL OR ac.next_review_at <= $3)
             ORDER BY ac.created_at ASC`,
            [userId, notebookId, now]
          );
          return rows;
        } else {
          const rows = await queryDb<AiCard>(
            `SELECT ac.* FROM ai_cards ac
             JOIN notebooks n ON n.id = ac.notebook_id
             WHERE n.user_id = $1
               AND (ac.next_review_at IS NULL OR ac.next_review_at <= $2)
             ORDER BY ac.created_at ASC`,
            [userId, now]
          );
          return rows;
        }
      } catch (e) {
        console.warn("Postgres listDueCards error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const userNotebooks = data.notebooks.filter((n) => n.user_id === userId || userId === "mcp");
    const nbIds = new Set(userNotebooks.map((n) => n.id));

    return data.ai_cards
      .filter((c) => {
        if (!nbIds.has(c.notebook_id)) return false;
        if (notebookId && c.notebook_id !== notebookId) return false;
        return !c.next_review_at || c.next_review_at <= now;
      })
      .sort((a, b) => (a.next_review_at || 0) - (b.next_review_at || 0));
  },

  async deleteAiCard(cardId: string): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM ai_cards WHERE id = $1`, [cardId]);
        return true;
      } catch (e) {
        console.warn("Postgres deleteAiCard error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const idx = data.ai_cards.findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      data.ai_cards.splice(idx, 1);
      saveFallbackData(data);
      return true;
    }
    return false;
  },

  async getKnowledgeGraphData(userId: string): Promise<{
    notebooks: Notebook[];
    pages: Page[];
    cards: AiCard[];
  }> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        const [notebooks, pages, cards] = await Promise.all([
          queryDb<Notebook>(
            `SELECT n.*, COUNT(p.id)::int AS page_count
             FROM notebooks n
             LEFT JOIN pages p ON p.notebook_id = n.id
             WHERE n.user_id = $1
             GROUP BY n.id
             ORDER BY n.updated_at DESC`,
            [userId],
          ),
          queryDb<Page>(
            `SELECT p.*
             FROM pages p
             JOIN notebooks n ON n.id = p.notebook_id
             WHERE n.user_id = $1
             ORDER BY p.notebook_id, p.page_number`,
            [userId],
          ),
          queryDb<AiCard>(
            `SELECT ac.*
             FROM ai_cards ac
             JOIN notebooks n ON n.id = ac.notebook_id
             WHERE n.user_id = $1
             ORDER BY ac.created_at DESC`,
            [userId],
          ),
        ]);
        return { notebooks, pages, cards };
      } catch (e) {
        console.warn("Postgres knowledge graph error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const notebooks = data.notebooks.filter(
      (notebook) => notebook.user_id === userId || userId === "mcp",
    );
    const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
    return {
      notebooks,
      pages: data.pages.filter((page) => notebookIds.has(page.notebook_id)),
      cards: data.ai_cards.filter((card) => notebookIds.has(card.notebook_id)),
    };
  },

  async searchNotes(userId: string, query: string) {
    const like = `%${query}%`;

    if (process.env.DATABASE_URL) {
      try {
        const pageResults = await queryDb(
          `SELECT p.notebook_id, p.page_number, p.text_content,
                 n.title as notebook_title, n.subject
          FROM pages p
          JOIN notebooks n ON n.id = p.notebook_id
          WHERE n.user_id = $1
            AND (p.text_content ILIKE $2)
          LIMIT 20`,
          [userId, like]
        );
        const cardResults = await queryDb(
          `SELECT ac.title, ac.content, ac.notebook_id, p.page_number, n.title as notebook_title
          FROM ai_cards ac
          JOIN pages p ON p.id = ac.page_id
          JOIN notebooks n ON n.id = ac.notebook_id
          WHERE n.user_id = $1
            AND (ac.title ILIKE $2 OR ac.content ILIKE $2)
          LIMIT 10`,
          [userId, like]
        );
        return { pages: pageResults, cards: cardResults };
      } catch (e) {
        console.warn("Postgres search error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const userNotebooks = data.notebooks.filter((n) => n.user_id === userId || userId === "mcp");
    const nbIds = new Set(userNotebooks.map((n) => n.id));
    const lowerQ = query.toLowerCase();

    const pageResults = data.pages
      .filter((p) => nbIds.has(p.notebook_id) && (p.text_content.toLowerCase().includes(lowerQ) || p.strokes_json.includes(lowerQ)))
      .map((p) => {
        const nb = userNotebooks.find((n) => n.id === p.notebook_id);
        return {
          notebook_id: p.notebook_id,
          page_number: p.page_number,
          text_content: p.text_content,
          notebook_title: nb?.title || "",
          subject: nb?.subject || "",
        };
      });

    const cardResults = data.ai_cards
      .filter((c) => nbIds.has(c.notebook_id) && (c.title.toLowerCase().includes(lowerQ) || c.content.toLowerCase().includes(lowerQ)))
      .map((c) => {
        const nb = userNotebooks.find((n) => n.id === c.notebook_id);
        const page = data.pages.find((p) => p.id === c.page_id);
        return {
          title: c.title,
          content: c.content,
          notebook_id: c.notebook_id,
          page_number: page?.page_number || 1,
          notebook_title: nb?.title || "",
        };
      });

    return { pages: pageResults, cards: cardResults };
  },

  async createPdfAnnotation(annotation: Omit<PdfAnnotation, "id" | "created_at">): Promise<PdfAnnotation> {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const full: PdfAnnotation = {
      ...annotation,
      id,
      created_at: now,
    };

    if (process.env.DATABASE_URL) {
      try {
        await queryDb(
          `INSERT INTO pdf_annotations (id, notebook_id, page_number, type, x, y, width, height, color, text, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            full.notebook_id,
            full.page_number,
            full.type,
            full.x,
            full.y,
            full.width,
            full.height,
            full.color,
            full.text || "",
            now,
          ]
        );
        return full;
      } catch (e) {
        console.warn("Postgres createPdfAnnotation error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (!data.pdf_annotations) data.pdf_annotations = [];
    data.pdf_annotations.push(full);
    saveFallbackData(data);
    return full;
  },

  async listPdfAnnotations(notebookId: string, pageNumber?: number): Promise<PdfAnnotation[]> {
    if (process.env.DATABASE_URL) {
      try {
        if (pageNumber) {
          const rows = await queryDb<PdfAnnotation>(
            `SELECT * FROM pdf_annotations WHERE notebook_id = $1 AND page_number = $2 ORDER BY created_at ASC`,
            [notebookId, pageNumber]
          );
          return rows;
        } else {
          const rows = await queryDb<PdfAnnotation>(
            `SELECT * FROM pdf_annotations WHERE notebook_id = $1 ORDER BY page_number ASC, created_at ASC`,
            [notebookId]
          );
          return rows;
        }
      } catch (e) {
        console.warn("Postgres listPdfAnnotations error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    const list = data.pdf_annotations || [];
    return list
      .filter((a) => a.notebook_id === notebookId && (!pageNumber || a.page_number === pageNumber))
      .sort((a, b) => a.created_at - b.created_at);
  },

  async deletePdfAnnotation(id: string): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM pdf_annotations WHERE id = $1`, [id]);
        return true;
      } catch (e) {
        console.warn("Postgres deletePdfAnnotation error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (!data.pdf_annotations) return false;
    const idx = data.pdf_annotations.findIndex((a) => a.id === id);
    if (idx >= 0) {
      data.pdf_annotations.splice(idx, 1);
      saveFallbackData(data);
      return true;
    }
    return false;
  },

  // ── Tags ─────────────────────────────────────────────────────────────

  async listTags(userId: string): Promise<Tag[]> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        return await queryDb<Tag>(`SELECT * FROM tags WHERE user_id = $1 ORDER BY name ASC`, [userId]);
      } catch (e) {
        console.warn("Postgres listTags error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    return (data.tags || []).filter((t) => t.user_id === userId);
  },

  async createTag(userId: string, name: string, color: string): Promise<Tag> {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const tag: Tag = { id, user_id: userId, name: name.trim(), color, created_at: now };

    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        await queryDb(
          `INSERT INTO tags (id, user_id, name, color, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, name) DO UPDATE SET color = $4`,
          [id, userId, tag.name, color, now]
        );
        const rows = await queryDb<Tag>(`SELECT * FROM tags WHERE user_id = $1 AND name = $2`, [userId, tag.name]);
        return rows[0] || tag;
      } catch (e) {
        console.warn("Postgres createTag error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (!data.tags) data.tags = [];
    const existing = data.tags.findIndex((t) => t.user_id === userId && t.name === tag.name);
    if (existing >= 0) { data.tags[existing].color = color; } else { data.tags.push(tag); }
    saveFallbackData(data);
    return tag;
  },

  async deleteTag(id: string, userId: string): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM tags WHERE id = $1 AND user_id = $2`, [id, userId]);
        return true;
      } catch (e) {
        console.warn("Postgres deleteTag error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    if (!data.tags) return false;
    const idx = data.tags.findIndex((t) => t.id === id && t.user_id === userId);
    if (idx >= 0) { data.tags.splice(idx, 1); saveFallbackData(data); return true; }
    return false;
  },

  async addTagToNotebook(notebookId: string, tagId: string): Promise<void> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(
          `INSERT INTO notebook_tags (notebook_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [notebookId, tagId]
        );
        return;
      } catch (e) {
        console.warn("Postgres addTagToNotebook error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    if (!data.notebook_tags) data.notebook_tags = [];
    if (!data.notebook_tags.find((nt) => nt.notebook_id === notebookId && nt.tag_id === tagId)) {
      data.notebook_tags.push({ notebook_id: notebookId, tag_id: tagId });
      saveFallbackData(data);
    }
  },

  async removeTagFromNotebook(notebookId: string, tagId: string): Promise<void> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM notebook_tags WHERE notebook_id = $1 AND tag_id = $2`, [notebookId, tagId]);
        return;
      } catch (e) {
        console.warn("Postgres removeTagFromNotebook error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    if (!data.notebook_tags) return;
    data.notebook_tags = data.notebook_tags.filter((nt) => !(nt.notebook_id === notebookId && nt.tag_id === tagId));
    saveFallbackData(data);
  },

  async getNotebookTags(notebookId: string): Promise<Tag[]> {
    if (process.env.DATABASE_URL) {
      try {
        return await queryDb<Tag>(
          `SELECT t.* FROM tags t JOIN notebook_tags nt ON t.id = nt.tag_id WHERE nt.notebook_id = $1 ORDER BY t.name ASC`,
          [notebookId]
        );
      } catch (e) {
        console.warn("Postgres getNotebookTags error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    const tagIds = new Set((data.notebook_tags || []).filter((nt) => nt.notebook_id === notebookId).map((nt) => nt.tag_id));
    return (data.tags || []).filter((t) => tagIds.has(t.id));
  },

  // ── Folders ───────────────────────────────────────────────────────────

  async listFolders(userId: string): Promise<Folder[]> {
    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        return await queryDb<Folder>(`SELECT * FROM folders WHERE user_id = $1 ORDER BY name ASC`, [userId]);
      } catch (e) {
        console.warn("Postgres listFolders error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    return (data.folders || []).filter((f) => f.user_id === userId);
  },

  async createFolder(userId: string, name: string, parentId?: string): Promise<Folder> {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const folder: Folder = { id, user_id: userId, name: name.trim(), parent_id: parentId || null, created_at: now };

    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        await queryDb(
          `INSERT INTO folders (id, user_id, name, parent_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [id, userId, folder.name, folder.parent_id, now]
        );
        return folder;
      } catch (e) {
        console.warn("Postgres createFolder error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (!data.folders) data.folders = [];
    data.folders.push(folder);
    saveFallbackData(data);
    return folder;
  },

  async deleteFolder(id: string, userId: string): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(`DELETE FROM folders WHERE id = $1 AND user_id = $2`, [id, userId]);
        return true;
      } catch (e) {
        console.warn("Postgres deleteFolder error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    if (!data.folders) return false;
    const idx = data.folders.findIndex((f) => f.id === id && f.user_id === userId);
    if (idx >= 0) { data.folders.splice(idx, 1); saveFallbackData(data); return true; }
    return false;
  },

  async moveNotebookToFolder(notebookId: string, userId: string, folderId: string | null): Promise<boolean> {
    if (process.env.DATABASE_URL) {
      try {
        await queryDb(
          `UPDATE notebooks SET folder_id = $1 WHERE id = $2 AND user_id = $3`,
          [folderId, notebookId, userId]
        );
        return true;
      } catch (e) {
        console.warn("Postgres moveNotebookToFolder error, using fallback:", e);
      }
    }
    // Fallback: folder_id not persisted in JSON but we can note it on the notebook object
    return true;
  },

  // ── Lecture Summaries ─────────────────────────────────────────────────

  async saveLectureSummary(summary: Omit<LectureSummary, "id" | "created_at">): Promise<LectureSummary> {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const full: LectureSummary = { ...summary, id, created_at: now };

    if (process.env.DATABASE_URL) {
      try {
        await bootstrapSchema();
        await queryDb(
          `INSERT INTO lecture_summaries (id, notebook_id, page_number, title, key_concepts, definitions, follow_up_questions, raw_text, model_used, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [
            id,
            full.notebook_id,
            full.page_number,
            full.title,
            JSON.stringify(full.key_concepts),
            JSON.stringify(full.definitions),
            JSON.stringify(full.follow_up_questions),
            full.raw_text,
            full.model_used,
            now,
          ]
        );
        return full;
      } catch (e) {
        console.warn("Postgres saveLectureSummary error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    if (!data.lecture_summaries) data.lecture_summaries = [];
    data.lecture_summaries.push(full);
    saveFallbackData(data);
    return full;
  },

  async listLectureSummaries(notebookId: string, pageNumber?: number): Promise<LectureSummary[]> {
    if (process.env.DATABASE_URL) {
      try {
        if (pageNumber !== undefined) {
          const rows = await queryDb<LectureSummary>(
            `SELECT * FROM lecture_summaries WHERE notebook_id = $1 AND page_number = $2 ORDER BY created_at DESC`,
            [notebookId, pageNumber]
          );
          return rows;
        }
        return await queryDb<LectureSummary>(
          `SELECT * FROM lecture_summaries WHERE notebook_id = $1 ORDER BY page_number ASC, created_at DESC`,
          [notebookId]
        );
      } catch (e) {
        console.warn("Postgres listLectureSummaries error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    return (data.lecture_summaries || []).filter(
      (s) => s.notebook_id === notebookId && (pageNumber === undefined || s.page_number === pageNumber)
    );
  },
};
