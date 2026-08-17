import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { AiCard } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const notebook = db
    .prepare("SELECT id FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId);
  if (!notebook && session.username !== "mcp-agent") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const pageNum = searchParams.get("page");

  let cards: AiCard[];
  if (pageNum) {
    const page = db
      .prepare("SELECT id FROM pages WHERE notebook_id = ? AND page_number = ?")
      .get(id, parseInt(pageNum)) as { id: string } | undefined;
    if (!page) return NextResponse.json({ data: [] });
    cards = db
      .prepare("SELECT * FROM ai_cards WHERE page_id = ? ORDER BY created_at DESC")
      .all(page.id) as AiCard[];
  } else {
    cards = db
      .prepare("SELECT * FROM ai_cards WHERE notebook_id = ? ORDER BY created_at DESC")
      .all(id) as AiCard[];
  }

  return NextResponse.json({ data: cards });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { page_number, title, content, diagram_type, diagram_data } =
    await req.json();

  if (!title || !content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  const db = getDb();

  // Get or create page
  let page = db
    .prepare("SELECT id FROM pages WHERE notebook_id = ? AND page_number = ?")
    .get(id, page_number ?? 1) as { id: string } | undefined;

  if (!page) {
    const pageId = uuid();
    db.prepare(
      "INSERT INTO pages (id, notebook_id, page_number) VALUES (?, ?, ?)"
    ).run(pageId, id, page_number ?? 1);
    page = { id: pageId };
  }

  const cardId = uuid();
  db.prepare(
    `INSERT INTO ai_cards (id, page_id, notebook_id, title, content, diagram_type, diagram_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    cardId,
    page.id,
    id,
    title,
    content,
    diagram_type ?? "none",
    diagram_data ?? ""
  );

  // Touch notebook
  db.prepare("UPDATE notebooks SET updated_at = ? WHERE id = ?").run(
    Math.floor(Date.now() / 1000),
    id
  );

  const card = db.prepare("SELECT * FROM ai_cards WHERE id = ?").get(cardId) as AiCard;
  return NextResponse.json({ data: card }, { status: 201 });
}
