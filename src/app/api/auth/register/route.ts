import { NextRequest, NextResponse } from "next/server";
import { getDb, bootstrapSchema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password || username.length < 3 || password.length < 6) {
    return NextResponse.json(
      { error: "Username ≥ 3 chars and password ≥ 6 chars required" },
      { status: 400 }
    );
  }

  await bootstrapSchema();
  const db = getDb();

  const existing = await db`SELECT id FROM users WHERE username = ${username}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const id = uuid();
  const password_hash = await bcrypt.hash(password, 12);
  await db`INSERT INTO users (id, username, password_hash) VALUES (${id}, ${username}, ${password_hash})`;

  const token = await signToken({ userId: id, username });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("synapse_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
