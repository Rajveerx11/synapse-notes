import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { dbService } from "@/lib/db";
import { buildKnowledgeGraph } from "@/lib/knowledgeGraph";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { notebooks, pages, cards } = await dbService.getKnowledgeGraphData(session.userId);
    return NextResponse.json({ data: buildKnowledgeGraph(notebooks, pages, cards) });
  } catch (err: unknown) {
    console.error("Knowledge graph GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
