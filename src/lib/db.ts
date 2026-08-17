import { Pool } from "pg";
import { User, Notebook, Page, AiCard } from "./types";
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
  return { users: [], notebooks: [], pages: [], ai_cards: [] };
}

function saveFallbackData(data: FallbackData): void {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("Fallback DB write error:", e);
  }
}

let pgPool: Pool | null = null;
let schemaInitialized = false;

// Query executor supporting Neon, Supabase, and any standard PostgreSQL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryDb<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("NO_DATABASE_URL");

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
          `INSERT INTO notebooks (id, user_id, title, subject, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, userId, title, subject || "", now, now]
        );
        await queryDb(
          `INSERT INTO pages (id, notebook_id, page_number) VALUES ($1, $2, 1)`,
          [firstPage.id, id]
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
    }
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (process.env.DATABASE_URL) {
      try {
        const existing = await queryDb<{ id: string }>(
          `SELECT id FROM pages WHERE notebook_id = $1 AND page_number = $2`,
          [notebookId, pageNumber]
        );
        if (existing.length > 0) {
          await queryDb(
            `UPDATE pages SET
              strokes_json = COALESCE($1, strokes_json),
              text_content = COALESCE($2, text_content),
              pdf_url = COALESCE($3, pdf_url),
              pdf_page = COALESCE($4, pdf_page),
              updated_at = $5
             WHERE id = $6`,
            [
              update.strokes_json ?? null,
              update.text_content ?? null,
              update.pdf_url ?? null,
              update.pdf_page ?? null,
              now,
              existing[0].id,
            ]
          );
          if (update.pdf_url) {
            await queryDb(`UPDATE pages SET pdf_url = $1 WHERE notebook_id = $2`, [update.pdf_url, notebookId]);
          }
          return existing[0].id;
        } else {
          const pageId = uuid();
          await queryDb(
            `INSERT INTO pages (id, notebook_id, page_number, strokes_json, text_content, pdf_url, pdf_page)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              pageId,
              notebookId,
              pageNumber,
              update.strokes_json ?? "[]",
              update.text_content ?? "",
              update.pdf_url ?? null,
              update.pdf_page ?? null,
            ]
          );
          if (update.pdf_url) {
            await queryDb(`UPDATE pages SET pdf_url = $1 WHERE notebook_id = $2`, [update.pdf_url, notebookId]);
          }
          await queryDb(`UPDATE notebooks SET updated_at = $1 WHERE id = $2`, [now, notebookId]);
          return pageId;
        }
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
};
