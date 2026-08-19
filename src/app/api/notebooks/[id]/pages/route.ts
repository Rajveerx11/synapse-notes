import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const owner = await dbService.getNotebookOwner(id);
    if (owner && owner !== session.userId && session.userId !== "mcp") {
      return NextResponse.json({ error: "Access forbidden" }, { status: 403 });
    }

    const pages = await dbService.listPages(id, session.userId);
    return NextResponse.json({ data: pages });
  } catch (err: unknown) {
    console.error("Pages GET error:", err);
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
    const {
      page_number,
      strokes_json,
      text_content,
      pdf_url,
      pdf_page,
      code_content,
      code_language,
      code_line_height,
    } = await req.json();

    // Verify notebook ownership to prevent IDOR attacks and auto-create if not yet persisted
    if (session.userId !== "mcp") {
      const owner = await dbService.getNotebookOwner(id);
      if (owner && owner !== session.userId) {
        return NextResponse.json({ error: "Access forbidden" }, { status: 403 });
      }
      if (!owner) {
        await dbService.createNotebook(id, session.userId, "Untitled Notebook", "");
      }
    }

    const pageId = await dbService.upsertPage(id, page_number ?? 1, {
      strokes_json,
      text_content,
      pdf_url,
      pdf_page,
      code_content,
      code_language,
      code_line_height,
    });

    return NextResponse.json({ data: { id: pageId } });
  } catch (err: unknown) {
    console.error("Pages POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
