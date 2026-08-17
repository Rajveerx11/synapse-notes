import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const pageNum = searchParams.get("page");

    const cards = await dbService.listAiCards(id, pageNum ? parseInt(pageNum) : undefined);
    return NextResponse.json({ data: cards });
  } catch (err: unknown) {
    console.error("Cards GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { page_number, title, content, diagram_type, diagram_data } = await req.json();

    if (!title || !content) {
      return NextResponse.json({ error: "title and content required" }, { status: 400 });
    }

    const card = await dbService.createAiCard({
      notebookId: id,
      pageNumber: page_number ?? 1,
      title,
      content,
      diagramType: diagram_type ?? "none",
      diagramData: diagram_data ?? "",
    });

    return NextResponse.json({ data: card }, { status: 201 });
  } catch (err: unknown) {
    console.error("Cards POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
