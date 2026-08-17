import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { put } from "@vercel/blob";
import { dbService } from "@/lib/db";
import { v4 as uuid } from "uuid";

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

    // 1. If Vercel Blob is configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`pdfs/${session.userId}/${Date.now()}-${file.name}`, file, {
          access: "public",
          contentType: "application/pdf",
        });
        return NextResponse.json({ data: { url: blob.url } }, { status: 201 });
      } catch (blobErr) {
        console.warn("Vercel Blob upload failed, using cloud database storage:", blobErr);
      }
    }

    // 2. Neon Database Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const pdfId = uuid();

    if (process.env.DATABASE_URL) {
      try {
        const { Pool } = await import("pg");
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        });
        const client = await pool.connect();
        try {
          await client.query(`
            CREATE TABLE IF NOT EXISTS pdf_files (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              filename TEXT NOT NULL,
              content_base64 TEXT NOT NULL,
              created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
            )
          `);
          await client.query(
            `INSERT INTO pdf_files (id, user_id, filename, content_base64) VALUES ($1, $2, $3, $4)`,
            [pdfId, session.userId, file.name, base64]
          );
          return NextResponse.json({ data: { url: `/api/pdf/${pdfId}` } }, { status: 201 });
        } finally {
          client.release();
          await pool.end();
        }
      } catch (dbErr) {
        console.warn("Database PDF insert warning, using data URI fallback:", dbErr);
      }
    }

    // 3. Fallback: Base64 data URI (works everywhere without file storage)
    const dataUri = `data:application/pdf;base64,${base64}`;
    return NextResponse.json({ data: { url: dataUri } }, { status: 201 });
  } catch (err: unknown) {
    console.error("PDF upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process PDF" },
      { status: 500 }
    );
  }
}
