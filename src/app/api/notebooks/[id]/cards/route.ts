import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const { searchParams } = new URL(req.url);
  const pageNum = searchParams.get("page");

  let cards;
  if (pageNum) {
    const pages = await db`
      SELECT id FROM pages WHERE notebook_id = ${id} AND page_number = ${parseInt(pageNum)}
    `;
    if (pages.length === 0) return NextResponse.json({ data: [] });
    cards = await db`
      SELECT * FROM ai_cards WHERE page_id = ${pages[0].id} ORDER BY created_at DESC
    `;
  } else {
    cards = await db`
      SELECT * FROM ai_cards WHERE notebook_id = ${id} ORDER BY created_at DESC
    `;
  }

  return NextResponse.json({ data: cards });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { page_number, title, content, diagram_type, diagram_data } = await req.json();

  if (!title || !content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  const db = getDb();

  let pageRows = await db`
    SELECT id FROM pages WHERE notebook_id = ${id} AND page_number = ${page_number ?? 1}
  `;

  if (pageRows.length === 0) {
    const pageId = uuid();
    await db`INSERT INTO pages (id, notebook_id, page_number) VALUES (${pageId}, ${id}, ${page_number ?? 1})`;
    pageRows = [{ id: pageId }];
  }

  const cardId = uuid();
  await db`
    INSERT INTO ai_cards (id, page_id, notebook_id, title, content, diagram_type, diagram_data)
    VALUES (${cardId}, ${pageRows[0].id}, ${id}, ${title}, ${content}, ${diagram_type ?? "none"}, ${diagram_data ?? ""})
  `;

  await db`UPDATE notebooks SET updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`;

  const card = await db`SELECT * FROM ai_cards WHERE id = ${cardId}`;
  return NextResponse.json({ data: card[0] }, { status: 201 });
}
