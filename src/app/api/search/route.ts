import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });

  const db = getDb();
  const like = `%${query}%`;

  const results = db
    .prepare(
      `SELECT p.notebook_id, p.page_number, p.text_content,
              n.title as notebook_title, n.subject
       FROM pages p
       JOIN notebooks n ON n.id = p.notebook_id
       WHERE n.user_id = ?
         AND (p.text_content LIKE ? OR p.strokes_json LIKE ?)
       LIMIT 20`
    )
    .all(session.userId, like, like);

  const cardResults = db
    .prepare(
      `SELECT ac.title, ac.content, ac.notebook_id, p.page_number, n.title as notebook_title
       FROM ai_cards ac
       JOIN pages p ON p.id = ac.page_id
       JOIN notebooks n ON n.id = ac.notebook_id
       WHERE n.user_id = ?
         AND (ac.title LIKE ? OR ac.content LIKE ?)
       LIMIT 10`
    )
    .all(session.userId, like, like);

  return NextResponse.json({ data: { pages: results, cards: cardResults } });
}
