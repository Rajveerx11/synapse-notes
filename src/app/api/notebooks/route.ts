import { NextRequest, NextResponse } from "next/server";
import { getDb, bootstrapSchema } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { Notebook } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await bootstrapSchema();
  const db = getDb();
  const notebooks = await db`
    SELECT n.*, COUNT(p.id)::int as page_count
    FROM notebooks n
    LEFT JOIN pages p ON p.notebook_id = n.id
    WHERE n.user_id = ${session.userId}
    GROUP BY n.id
    ORDER BY n.updated_at DESC
  `;

  return NextResponse.json({ data: notebooks });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, subject } = await req.json();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  await bootstrapSchema();
  const db = getDb();
  const id = uuid();
  const now = Math.floor(Date.now() / 1000);

  await db`
    INSERT INTO notebooks (id, user_id, title, subject, created_at, updated_at)
    VALUES (${id}, ${session.userId}, ${title}, ${subject || ""}, ${now}, ${now})
  `;

  const pageId = uuid();
  await db`INSERT INTO pages (id, notebook_id, page_number) VALUES (${pageId}, ${id}, 1)`;

  const rows = await db`SELECT * FROM notebooks WHERE id = ${id}`;
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
