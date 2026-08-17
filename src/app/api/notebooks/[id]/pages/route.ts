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

  const nb = await db`SELECT id FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}`;
  if (nb.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pages = await db`SELECT * FROM pages WHERE notebook_id = ${id} ORDER BY page_number`;
  return NextResponse.json({ data: pages });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const nb = await db`SELECT id FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}`;
  if (nb.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { page_number, strokes_json, text_content, pdf_url, pdf_page } = await req.json();
  const now = Math.floor(Date.now() / 1000);

  const existing = await db`
    SELECT id FROM pages WHERE notebook_id = ${id} AND page_number = ${page_number}
  `;

  if (existing.length > 0) {
    await db`
      UPDATE pages SET
        strokes_json = COALESCE(${strokes_json ?? null}, strokes_json),
        text_content = COALESCE(${text_content ?? null}, text_content),
        pdf_url = COALESCE(${pdf_url ?? null}, pdf_url),
        pdf_page = COALESCE(${pdf_page ?? null}, pdf_page),
        updated_at = ${now}
      WHERE id = ${existing[0].id}
    `;
    return NextResponse.json({ data: { id: existing[0].id } });
  } else {
    const pageId = uuid();
    await db`
      INSERT INTO pages (id, notebook_id, page_number, strokes_json, text_content, pdf_url, pdf_page)
      VALUES (${pageId}, ${id}, ${page_number}, ${strokes_json ?? "[]"}, ${text_content ?? ""}, ${pdf_url ?? null}, ${pdf_page ?? null})
    `;
    await db`UPDATE notebooks SET updated_at = ${now} WHERE id = ${id}`;
    return NextResponse.json({ data: { id: pageId } }, { status: 201 });
  }
}
