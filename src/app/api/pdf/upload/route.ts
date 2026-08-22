import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { dbService } from "@/lib/db";

const MAX_PDF_SIZE = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const session = body.type === "blob.generate-client-token"
      ? await requireSession(req)
      : null;

    if (body.type === "blob.generate-client-token" && !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await handleUpload({
      request: req,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!session) throw new Error("Unauthorized");
        if (!pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error("File must be a PDF");
        }

        let notebookId = "";
        try {
          notebookId = JSON.parse(clientPayload || "{}").notebookId || "";
        } catch {
          throw new Error("Invalid upload metadata");
        }

        const owner = notebookId ? await dbService.getNotebookOwner(notebookId) : null;
        if (!owner || owner !== session.userId) {
          throw new Error("Access forbidden");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_PDF_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ notebookId, userId: session.userId }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Direct PDF upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF upload failed" },
      { status: 400 }
    );
  }
}
