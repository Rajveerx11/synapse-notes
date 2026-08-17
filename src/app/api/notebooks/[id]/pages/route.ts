import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { Page } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // Verify ownership
  const notebook = db
    .prepare("SELECT id FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId);
  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pages = db
    .prepare("SELECT * FROM pages WHERE notebook_id = ? ORDER BY page_number")
    .all(id) as Page[];

  return NextResponse.json({ data: pages });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const notebook = db
    .prepare("SELECT id FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId);
  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { page_number, strokes_json, text_content, pdf_url, pdf_page } =
    await req.json();

  const now = Math.floor(Date.now() / 1000);

  // Upsert page
  const existing = db
    .prepare("SELECT id FROM pages WHERE notebook_id = ? AND page_number = ?")
    .get(id, page_number) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE pages SET strokes_json = COALESCE(?, strokes_json),
       text_content = COALESCE(?, text_content),
       pdf_url = COALESCE(?, pdf_url),
       pdf_page = COALESCE(?, pdf_page),
       updated_at = ? WHERE id = ?`
    ).run(
      strokes_json ?? null,
      text_content ?? null,
      pdf_url ?? null,
      pdf_page ?? null,
      now,
      existing.id
    );
    return NextResponse.json({ data: { id: existing.id } });
  } else {
    const pageId = uuid();
    db.prepare(
      `INSERT INTO pages (id, notebook_id, page_number, strokes_json, text_content, pdf_url, pdf_page)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      pageId,
      id,
      page_number,
      strokes_json ?? "[]",
      text_content ?? "",
      pdf_url ?? null,
      pdf_page ?? null
    );
    // Touch notebook updated_at
    db.prepare("UPDATE notebooks SET updated_at = ? WHERE id = ?").run(now, id);
    return NextResponse.json({ data: { id: pageId } }, { status: 201 });
  }
}
