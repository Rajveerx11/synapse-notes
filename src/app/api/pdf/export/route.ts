import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PDFDocument, rgb, LineCapStyle } from "pdf-lib";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
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

const UPLOAD_DIR = path.resolve("./public/uploads");

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pdfUrl, strokes, canvasWidth, canvasHeight } = await req.json() as {
    pdfUrl: string;
    strokes: Stroke[];
    canvasWidth: number;
    canvasHeight: number;
  };

  if (!pdfUrl) return NextResponse.json({ error: "pdfUrl required" }, { status: 400 });

  // Fetch the original PDF (handle relative or absolute URLs)
  let pdfBuffer: ArrayBuffer;
  if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) {
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) return NextResponse.json({ error: "Could not fetch PDF" }, { status: 400 });
    pdfBuffer = await pdfRes.arrayBuffer();
  } else {
    const fs = await import("fs/promises");
    const localPath = path.join(process.cwd(), "public", pdfUrl.replace(/^\//, ""));
    const file = await fs.readFile(localPath);
    pdfBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = pages[0]; // annotate first page

  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Scale factors from canvas coordinate space to PDF coordinate space
  const scaleX = pageWidth / (canvasWidth || pageWidth);
  const scaleY = pageHeight / (canvasHeight || pageHeight);

  for (const stroke of (strokes || [])) {
    if (stroke.tool === "eraser" || stroke.points.length < 2) continue;

    const [r, g, b] = hexToRgb(stroke.color || "#000000");
    const opacity = stroke.tool === "highlighter" ? 0.4 : (stroke.opacity || 1);

    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];

      // PDF coordinate system: origin is bottom-left, Y is flipped
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

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(
      `exports/${session.userId}/annotated-${Date.now()}.pdf`,
      Buffer.from(annotatedBytes),
      { access: "public", contentType: "application/pdf" }
    );
    return NextResponse.json({ data: { url: blob.url } });
  }

  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
  const filename = `annotated-${uuid()}.pdf`;
  await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(annotatedBytes));
  return NextResponse.json({ data: { url: `/uploads/${filename}` } });
}
