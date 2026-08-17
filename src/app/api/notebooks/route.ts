import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { Notebook } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const notebooks = db
    .prepare(
      `SELECT n.*, COUNT(p.id) as page_count
       FROM notebooks n
       LEFT JOIN pages p ON p.notebook_id = n.id
       WHERE n.user_id = ?
       GROUP BY n.id
       ORDER BY n.updated_at DESC`
    )
    .all(session.userId) as Notebook[];

  return NextResponse.json({ data: notebooks });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, subject } = await req.json();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const db = getDb();
  const id = uuid();
  const now = Math.floor(Date.now() / 1000);

  // Create notebook + first page
  db.prepare(
    "INSERT INTO notebooks (id, user_id, title, subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, session.userId, title, subject || "", now, now);

  const pageId = uuid();
  db.prepare(
    "INSERT INTO pages (id, notebook_id, page_number) VALUES (?, ?, 1)"
  ).run(pageId, id);

  const notebook = db
    .prepare("SELECT * FROM notebooks WHERE id = ?")
    .get(id) as Notebook;

  return NextResponse.json({ data: notebook }, { status: 201 });
}
