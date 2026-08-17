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

  const pageResults = await db`
    SELECT p.notebook_id, p.page_number, p.text_content,
           n.title as notebook_title, n.subject
    FROM pages p
    JOIN notebooks n ON n.id = p.notebook_id
    WHERE n.user_id = ${session.userId}
      AND (p.text_content ILIKE ${like})
    LIMIT 20
  `;

  const cardResults = await db`
    SELECT ac.title, ac.content, ac.notebook_id, p.page_number, n.title as notebook_title
    FROM ai_cards ac
    JOIN pages p ON p.id = ac.page_id
    JOIN notebooks n ON n.id = ac.notebook_id
    WHERE n.user_id = ${session.userId}
      AND (ac.title ILIKE ${like} OR ac.content ILIKE ${like})
    LIMIT 10
  `;

  return NextResponse.json({ data: { pages: pageResults, cards: cardResults } });
}
