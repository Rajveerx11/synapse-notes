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

    const result = await dbService.ensureNotebook(id, session.userId);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    console.error("Notebook GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { title, subject } = await req.json();

    const owner = await dbService.getNotebookOwner(id);
    if (owner && owner !== session.userId && session.userId !== "mcp") {
      return NextResponse.json({ error: "Access forbidden" }, { status: 403 });
    }

    if (!owner) {
      await dbService.createNotebook(id, session.userId, title || "Untitled Notebook", subject || "");
      return NextResponse.json({ ok: true });
    }

    const ok = await dbService.updateNotebook(id, session.userId, title, subject);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Notebook PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbService.deleteNotebook(id, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Notebook DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
