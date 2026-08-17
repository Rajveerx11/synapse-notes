import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PDFDocument, rgb, LineCapStyle } from "pdf-lib";
import { put } from "@vercel/blob";
import { v4 as uuid } from "uuid";

interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  opacity: number;
  points: StrokePoint[];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pdfUrl, strokes, canvasWidth, canvasHeight } = (await req.json()) as {
      pdfUrl: string;
      strokes: Stroke[];
      canvasWidth: number;
      canvasHeight: number;
    };

    if (!pdfUrl) return NextResponse.json({ error: "pdfUrl required" }, { status: 400 });

    let pdfBuffer: ArrayBuffer;

    if (pdfUrl.startsWith("data:application/pdf;base64,")) {
      const base64 = pdfUrl.replace("data:application/pdf;base64,", "");
      const buf = Buffer.from(base64, "base64");
      pdfBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } else if (pdfUrl.startsWith("/api/pdf/")) {
      const id = pdfUrl.replace("/api/pdf/", "");
      if (process.env.DATABASE_URL) {
        const { Pool } = await import("pg");
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        });
        const client = await pool.connect();
        try {
          const res = await client.query(`SELECT content_base64 FROM pdf_files WHERE id = $1`, [id]);
          if (res.rows.length === 0) throw new Error("Source PDF not found in database");
          const buf = Buffer.from(res.rows[0].content_base64, "base64");
          pdfBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } finally {
          client.release();
          await pool.end();
        }
      } else {
        throw new Error("Source PDF not found");
      }
    } else if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) {
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) return NextResponse.json({ error: "Could not fetch PDF" }, { status: 400 });
      pdfBuffer = await pdfRes.arrayBuffer();
    } else {
      const fs = await import("fs/promises");
      const path = await import("path");
      const localPath = path.join(process.cwd(), "public", pdfUrl.replace(/^\//, ""));
      const file = await fs.readFile(localPath);
      pdfBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const page = pages[0];

    const { width: pageWidth, height: pageHeight } = page.getSize();

    const scaleX = pageWidth / (canvasWidth || pageWidth);
    const scaleY = pageHeight / (canvasHeight || pageHeight);

    for (const stroke of strokes || []) {
      if (stroke.tool === "eraser" || stroke.points.length < 2) continue;

      const [r, g, b] = hexToRgb(stroke.color || "#000000");
      const opacity = stroke.tool === "highlighter" ? 0.4 : stroke.opacity || 1;

      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1];
        const curr = stroke.points[i];

        page.drawLine({
          start: {
            x: prev.x * scaleX,
            y: pageHeight - prev.y * scaleY,
          },
          end: {
            x: curr.x * scaleX,
            y: pageHeight - curr.y * scaleY,
          },
          thickness: Math.max(1, (stroke.size || 2) * Math.min(scaleX, scaleY)),
          color: rgb(r, g, b),
          opacity,
          lineCap: LineCapStyle.Round,
        });
      }
    }

    const annotatedBytes = await pdfDoc.save();

    // 1. If Vercel Blob is configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `exports/${session.userId}/annotated-${Date.now()}.pdf`,
        Buffer.from(annotatedBytes),
        { access: "public", contentType: "application/pdf" }
      );
      return NextResponse.json({ data: { url: blob.url } });
    }

    // 2. Neon Database Storage
    if (process.env.DATABASE_URL) {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const client = await pool.connect();
      try {
        const exportId = uuid();
        const base64 = Buffer.from(annotatedBytes).toString("base64");
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
          [exportId, session.userId, `annotated-${Date.now()}.pdf`, base64]
        );
        return NextResponse.json({ data: { url: `/api/pdf/${exportId}` } });
      } finally {
        client.release();
        await pool.end();
      }
    }

    // 3. Fallback data URI
    const dataUri = `data:application/pdf;base64,${Buffer.from(annotatedBytes).toString("base64")}`;
    return NextResponse.json({ data: { url: dataUri } });
  } catch (err: unknown) {
    console.error("PDF export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export PDF" },
      { status: 500 }
    );
  }
}
