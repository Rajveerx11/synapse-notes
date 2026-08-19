import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** GET /api/notebooks/[id]/tags */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const tags = await dbService.getNotebookTags(id);
    return NextResponse.json({ data: tags });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** POST /api/notebooks/[id]/tags — { tagId } — add tag to notebook */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { tagId } = await req.json();
    if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });

    // Ownership check
    const nb = await dbService.getNotebook(id, session.userId);
    if (!nb) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await dbService.addTagToNotebook(id, tagId);
    return NextResponse.json({ data: { success: true } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** DELETE /api/notebooks/[id]/tags?tagId=... — remove tag from notebook */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });

    await dbService.removeTagFromNotebook(id, tagId);
    return NextResponse.json({ data: { success: true } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
