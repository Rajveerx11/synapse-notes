import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const notebooks = await dbService.listNotebooks(session.userId);
    return NextResponse.json({ data: notebooks });
  } catch (err: unknown) {
    console.error("Notebooks GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, subject } = await req.json();
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

    const id = uuid();
    const nb = await dbService.createNotebook(id, session.userId, title, subject || "");
    return NextResponse.json({ data: nb }, { status: 201 });
  } catch (err: unknown) {
    console.error("Notebooks POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
