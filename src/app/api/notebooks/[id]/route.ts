import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const notebooks = await db`
    SELECT * FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}
  `;
  if (notebooks.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pages = await db`
    SELECT * FROM pages WHERE notebook_id = ${id} ORDER BY page_number
  `;

  return NextResponse.json({ data: { notebook: notebooks[0], pages } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = await db`SELECT id FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}`;
  if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title, subject } = await req.json();
  const now = Math.floor(Date.now() / 1000);

  await db`
    UPDATE notebooks SET
      title = COALESCE(${title ?? null}, title),
      subject = COALESCE(${subject ?? null}, subject),
      updated_at = ${now}
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  await db`DELETE FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}`;
  return NextResponse.json({ ok: true });
}
