import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/folders/[id] */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const ok = await dbService.deleteFolder(id, session.userId);
    return NextResponse.json({ data: { success: ok } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** PATCH /api/folders/[id] — move notebook to folder: { notebookId, folderId } */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { notebookId, folderId } = await req.json();
    if (!notebookId) return NextResponse.json({ error: "notebookId required" }, { status: 400 });
    // id is the folder we're targeting — use folderId param or current id
    const targetFolder = folderId !== undefined ? folderId : id;
    const ok = await dbService.moveNotebookToFolder(notebookId, session.userId, targetFolder);
    return NextResponse.json({ data: { success: ok } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
