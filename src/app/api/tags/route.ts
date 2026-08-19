import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/** GET /api/tags — list all tags for the current user */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tags = await dbService.listTags(session.userId);
    return NextResponse.json({ data: tags });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** POST /api/tags — create a tag */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const PRESET_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
    const tagColor = color || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    const tag = await dbService.createTag(session.userId, name, tagColor);
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
