import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/notebooks/[id]/annotations?page=1
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get("page");
    const pageNumber = pageParam ? parseInt(pageParam, 10) : undefined;

    const annotations = await dbService.listPdfAnnotations(id, pageNumber);
    return NextResponse.json({ data: annotations });
  } catch (err: unknown) {
    console.error("Annotations GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notebooks/[id]/annotations
 * Body: { page_number: number, type: "highlight"|"underline"|"sticky", x, y, width, height, color, text? }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    if (!body.page_number || !body.type || body.x === undefined || body.y === undefined) {
      return NextResponse.json({ error: "Missing required annotation fields" }, { status: 400 });
    }

    const created = await dbService.createPdfAnnotation({
      notebook_id: id,
      page_number: body.page_number,
      type: body.type,
      x: body.x,
      y: body.y,
      width: body.width ?? 0,
      height: body.height ?? 0,
      color: body.color || "#fde047",
      text: body.text || "",
    });

    return NextResponse.json({ data: created });
  } catch (err: unknown) {
    console.error("Annotations POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notebooks/[id]/annotations?annotationId=...
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const annotationId = searchParams.get("annotationId");
    if (!annotationId) {
      return NextResponse.json({ error: "annotationId is required" }, { status: 400 });
    }

    const ok = await dbService.deletePdfAnnotation(annotationId);
    return NextResponse.json({ data: { success: ok } });
  } catch (err: unknown) {
    console.error("Annotations DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
