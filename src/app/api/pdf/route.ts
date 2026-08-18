import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { uploadFileToStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Limit max file size to 50 MB to prevent DoS/memory exhaustion
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 50 MB limit" }, { status: 413 });
    }

    const isPdf =
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type.toLowerCase().includes("pdf") ||
      file.type === "application/octet-stream";

    if (!isPdf) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46)
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      return NextResponse.json({ error: "Invalid PDF file structure (magic header check failed)" }, { status: 400 });
    }

    const { url, provider } = await uploadFileToStorage(
      session.userId,
      file.name,
      buffer,
      "application/pdf"
    );

    return NextResponse.json({ data: { url, provider } }, { status: 201 });
  } catch (err: unknown) {
    console.error("PDF upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process PDF" },
      { status: 500 }
    );
  }
}
