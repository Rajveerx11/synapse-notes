import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const blobUrl = searchParams.get("url");

    if (!blobUrl) {
      return NextResponse.json({ error: "Missing blob url" }, { status: 400 });
    }

    // SSRF Defense: Validate URL structure and restrict to trusted storage domains only
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(blobUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Only HTTPS URLs are permitted" }, { status: 400 });
    }

    const host = parsedUrl.hostname.toLowerCase();
    const isAllowedHost =
      host.endsWith(".blob.vercel-storage.com") ||
      host.endsWith(".r2.cloudflarestorage.com") ||
      (process.env.R2_PUBLIC_DOMAIN && host === new URL(process.env.R2_PUBLIC_DOMAIN).hostname.toLowerCase());

    if (!isAllowedHost) {
      return NextResponse.json({ error: "Forbidden storage domain" }, { status: 403 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const headers: Record<string, string> = {};
    if (token && host.endsWith("blob.vercel-storage.com")) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(blobUrl, { headers });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not fetch blob asset" },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/pdf";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: unknown) {
    console.error("Blob stream route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
