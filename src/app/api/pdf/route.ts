import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { writeFile } from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";
import { existsSync, mkdirSync } from "fs";

const UPLOAD_DIR = path.resolve("./public/uploads");

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF file required" }, { status: 400 });
  }

  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const filename = `${uuid()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ data: { url: `/uploads/${filename}` } }, { status: 201 });
}
