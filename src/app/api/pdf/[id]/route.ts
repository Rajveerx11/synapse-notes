import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id || !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT filename, content_base64 FROM pdf_files WHERE id = $1`,
        [id]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ error: "PDF not found" }, { status: 404 });
      }

      const { filename, content_base64 } = res.rows[0];
      const buffer = Buffer.from(content_base64, "base64");

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename || "document.pdf")}"`,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err: unknown) {
    console.error("PDF retrieve error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retrieve PDF" },
      { status: 500 }
    );
  }
}
