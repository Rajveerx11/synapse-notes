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

    const isPdf =
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type.toLowerCase().includes("pdf") ||
      file.type === "application/octet-stream";

    if (!isPdf) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
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
