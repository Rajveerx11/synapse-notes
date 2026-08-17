import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Notebook } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const notebook = db
    .prepare("SELECT * FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId) as Notebook | undefined;

  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pages = db
    .prepare("SELECT * FROM pages WHERE notebook_id = ? ORDER BY page_number")
    .all(id);

  return NextResponse.json({ data: { notebook, pages } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const notebook = db
    .prepare("SELECT id FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId);
  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title, subject } = await req.json();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "UPDATE notebooks SET title = COALESCE(?, title), subject = COALESCE(?, subject), updated_at = ? WHERE id = ?"
  ).run(title ?? null, subject ?? null, now, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM notebooks WHERE id = ? AND user_id = ?").run(id, session.userId);
  return NextResponse.json({ ok: true });
}
