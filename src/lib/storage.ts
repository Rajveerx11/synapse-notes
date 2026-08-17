import { put } from "@vercel/blob";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuid } from "uuid";

interface UploadResult {
  url: string;
  provider: "cloudflare_r2" | "vercel_blob" | "neon_postgres";
}

/**
 * Initializes S3Client for Cloudflare R2 if environment variables are provided
 */
function getR2Client(): { client: S3Client; bucket: string; publicDomain?: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "synapse-notes";
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;

  if (accountId && accessKeyId && secretAccessKey) {
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    return { client, bucket, publicDomain };
  }
  return null;
}

/**
 * Universal upload method with automatic provider selection:
 * 1. Cloudflare R2 (10 GB free forever / zero egress fees)
 * 2. Vercel Blob (1 GB free)
 * 3. Neon Postgres fallback (base64 table)
 */
export async function uploadFileToStorage(
  userId: string,
  filename: string,
  buffer: Buffer,
  contentType = "application/pdf"
): Promise<UploadResult> {
  const safeFilename = filename.trim().replace(/[^a-zA-Z0-9_.-]/g, "_");
  const uniqueKey = `users/${userId}/${Date.now()}-${safeFilename}`;

  // 1. Cloudflare R2 Storage (Preferred)
  const r2 = getR2Client();
  if (r2) {
    try {
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: uniqueKey,
          Body: buffer,
          ContentType: contentType,
        })
      );

      const url = r2.publicDomain
        ? `${r2.publicDomain.replace(/\/$/, "")}/${uniqueKey}`
        : `/api/pdf/r2?key=${encodeURIComponent(uniqueKey)}`;

      return { url, provider: "cloudflare_r2" };
    } catch (err) {
      console.warn("Cloudflare R2 upload error, falling back to next provider:", err);
    }
  }

  // 2. Vercel Blob Storage
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(uniqueKey, buffer, {
        access: "public",
        contentType,
      });
      return { url: blob.url, provider: "vercel_blob" };
    } catch (err) {
      console.warn("Vercel Blob upload error, falling back to database:", err);
    }
  }

  // 3. Neon PostgreSQL DB Fallback
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const client = await pool.connect();
    try {
      const id = uuid();
      const base64 = buffer.toString("base64");
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
        [id, userId, safeFilename, base64]
      );
      return { url: `/api/pdf/${id}`, provider: "neon_postgres" };
    } finally {
      client.release();
      await pool.end();
    }
  }

  // 4. In-Memory Data URI Fallback
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
  return { url: dataUri, provider: "neon_postgres" };
}
