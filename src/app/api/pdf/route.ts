import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const UPLOAD_DIR = path.resolve("./public/uploads");

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF file required" }, { status: 400 });
  }

  // If Vercel Blob is configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`pdfs/${session.userId}/${Date.now()}-${file.name}`, file, {
      access: "public",
      contentType: "application/pdf",
    });
    return NextResponse.json({ data: { url: blob.url } }, { status: 201 });
  }

  // Local fallback
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
  const filename = `${uuid()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ data: { url: `/uploads/${filename}` } }, { status: 201 });
}
