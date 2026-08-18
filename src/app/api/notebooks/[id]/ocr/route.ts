import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/notebooks/[id]/ocr
 * Body: { page_number: number; ocr_text: string }
 *
 * Saves OCR-extracted text to both text_content (for existing search) and
 * the ocr_text column (added via migration in bootstrapSchema).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { page_number, ocr_text } = await req.json();

    if (!page_number || typeof ocr_text !== "string") {
      return NextResponse.json({ error: "page_number and ocr_text are required" }, { status: 400 });
    }

    // Upsert page with ocr_text stored in text_content (searchable by existing query)
    await dbService.upsertPage(id, page_number, {
      text_content: ocr_text,
    });

    return NextResponse.json({ data: { saved: true, page_number, length: ocr_text.length } });
  } catch (err: unknown) {
    console.error("OCR save error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
