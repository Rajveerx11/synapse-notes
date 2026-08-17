import { neon, NeonQueryFunction } from "@neondatabase/serverless";
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

let sql: NeonQueryFunction<false, false> | null = null;
let schemaInitialized = false;

function getSql(): NeonQueryFunction<false, false> | null {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) {
    try {
      sql = neon(process.env.DATABASE_URL);
    } catch (e) {
      console.warn("Neon initialization error:", e);
      sql = null;
    }
  }
  return sql;
}

export async function bootstrapSchema(): Promise<void> {
  const db = getSql();
  if (!db || schemaInitialized) return;

  try {
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
    schemaInitialized = true;
  } catch (e) {
    console.warn("Schema bootstrap warning:", e);
  }
}

export const dbService = {
  async findUserByUsername(username: string): Promise<User | null> {
    const db = getSql();
    if (db) {
      try {
        await bootstrapSchema();
        const rows = await db`SELECT * FROM users WHERE username = ${username}`;
        return (rows[0] as unknown as User) || null;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
      }
    }
    const data = loadFallbackData();
    return data.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
  },

  async createUser(id: string, username: string, passwordHash: string): Promise<User> {
    const now = Math.floor(Date.now() / 1000);
    const user: User = { id, username, password_hash: passwordHash, created_at: now };

    const db = getSql();
    if (db) {
      try {
        await bootstrapSchema();
        await db`INSERT INTO users (id, username, password_hash) VALUES (${id}, ${username}, ${passwordHash})`;
        return user;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
      }
    }

    const data = loadFallbackData();
    data.users.push(user);
    saveFallbackData(data);
    return user;
  },

  async listNotebooks(userId: string): Promise<Notebook[]> {
    const db = getSql();
    if (db) {
      try {
        await bootstrapSchema();
        const rows = await db`
          SELECT n.*, COUNT(p.id)::int as page_count
          FROM notebooks n
          LEFT JOIN pages p ON p.notebook_id = n.id
          WHERE n.user_id = ${userId}
          GROUP BY n.id
          ORDER BY n.updated_at DESC
        `;
        return rows as unknown as Notebook[];
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    if (db) {
      try {
        await bootstrapSchema();
        const nbs = await db`SELECT * FROM notebooks WHERE id = ${id} AND user_id = ${userId}`;
        if (nbs.length > 0) {
          const pages = await db`SELECT * FROM pages WHERE notebook_id = ${id} ORDER BY page_number`;
          return { notebook: nbs[0] as unknown as Notebook, pages: pages as unknown as Page[] };
        }
        return null;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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

    const db = getSql();
    if (db) {
      try {
        await bootstrapSchema();
        await db`
          INSERT INTO notebooks (id, user_id, title, subject, created_at, updated_at)
          VALUES (${id}, ${userId}, ${title}, ${subject || ""}, ${now}, ${now})
        `;
        await db`INSERT INTO pages (id, notebook_id, page_number) VALUES (${firstPage.id}, ${id}, 1)`;
        return nb;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    if (db) {
      try {
        await db`
          UPDATE notebooks SET
            title = COALESCE(${title ?? null}, title),
            subject = COALESCE(${subject ?? null}, subject),
            updated_at = ${now}
          WHERE id = ${id} AND user_id = ${userId}
        `;
        return true;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    if (db) {
      try {
        await db`DELETE FROM notebooks WHERE id = ${id} AND user_id = ${userId}`;
        return true;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    if (db) {
      try {
        const pages = await db`SELECT * FROM pages WHERE notebook_id = ${notebookId} ORDER BY page_number`;
        return pages as unknown as Page[];
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();

    if (db) {
      try {
        const existing = await db`
          SELECT id FROM pages WHERE notebook_id = ${notebookId} AND page_number = ${pageNumber}
        `;
        if (existing.length > 0) {
          await db`
            UPDATE pages SET
              strokes_json = COALESCE(${update.strokes_json ?? null}, strokes_json),
              text_content = COALESCE(${update.text_content ?? null}, text_content),
              pdf_url = COALESCE(${update.pdf_url ?? null}, pdf_url),
              pdf_page = COALESCE(${update.pdf_page ?? null}, pdf_page),
              updated_at = ${now}
            WHERE id = ${existing[0].id}
          `;
          return existing[0].id as string;
        } else {
          const pageId = uuid();
          await db`
            INSERT INTO pages (id, notebook_id, page_number, strokes_json, text_content, pdf_url, pdf_page)
            VALUES (${pageId}, ${notebookId}, ${pageNumber}, ${update.strokes_json ?? "[]"}, ${update.text_content ?? ""}, ${update.pdf_url ?? null}, ${update.pdf_page ?? null})
          `;
          await db`UPDATE notebooks SET updated_at = ${now} WHERE id = ${notebookId}`;
          return pageId;
        }
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    if (db) {
      try {
        if (pageNumber) {
          const pages = await db`
            SELECT id FROM pages WHERE notebook_id = ${notebookId} AND page_number = ${pageNumber}
          `;
          if (pages.length === 0) return [];
          const cards = await db`
            SELECT * FROM ai_cards WHERE page_id = ${pages[0].id} ORDER BY created_at DESC
          `;
          return cards as unknown as AiCard[];
        } else {
          const cards = await db`
            SELECT * FROM ai_cards WHERE notebook_id = ${notebookId} ORDER BY created_at DESC
          `;
          return cards as unknown as AiCard[];
        }
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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

    const db = getSql();
    if (db) {
      try {
        let pageRows = await db`
          SELECT id FROM pages WHERE notebook_id = ${cardInput.notebookId} AND page_number = ${cardInput.pageNumber}
        `;
        let pageId = pageRows[0]?.id;
        if (!pageId) {
          pageId = uuid();
          await db`INSERT INTO pages (id, notebook_id, page_number) VALUES (${pageId}, ${cardInput.notebookId}, ${cardInput.pageNumber})`;
        }
        await db`
          INSERT INTO ai_cards (id, page_id, notebook_id, title, content, diagram_type, diagram_data, created_at)
          VALUES (${cardId}, ${pageId}, ${cardInput.notebookId}, ${cardInput.title}, ${cardInput.content}, ${cardInput.diagramType ?? "none"}, ${cardInput.diagramData ?? ""}, ${now})
        `;
        await db`UPDATE notebooks SET updated_at = ${now} WHERE id = ${cardInput.notebookId}`;
        const cardRows = await db`SELECT * FROM ai_cards WHERE id = ${cardId}`;
        return cardRows[0] as unknown as AiCard;
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
    const db = getSql();
    const like = `%${query}%`;

    if (db) {
      try {
        const pageResults = await db`
          SELECT p.notebook_id, p.page_number, p.text_content,
                 n.title as notebook_title, n.subject
          FROM pages p
          JOIN notebooks n ON n.id = p.notebook_id
          WHERE n.user_id = ${userId}
            AND (p.text_content ILIKE ${like})
          LIMIT 20
        `;
        const cardResults = await db`
          SELECT ac.title, ac.content, ac.notebook_id, p.page_number, n.title as notebook_title
          FROM ai_cards ac
          JOIN pages p ON p.id = ac.page_id
          JOIN notebooks n ON n.id = ac.notebook_id
          WHERE n.user_id = ${userId}
            AND (ac.title ILIKE ${like} OR ac.content ILIKE ${like})
          LIMIT 10
        `;
        return { pages: pageResults, cards: cardResults };
      } catch (e) {
        console.warn("Postgres error, using fallback:", e);
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
