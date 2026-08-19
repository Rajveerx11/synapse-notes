import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/** GET /api/folders */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const folders = await dbService.listFolders(session.userId);
    return NextResponse.json({ data: folders });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** POST /api/folders — { name, parentId? } */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, parentId } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const folder = await dbService.createFolder(session.userId, name, parentId);
    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
