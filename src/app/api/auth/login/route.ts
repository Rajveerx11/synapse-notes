import { NextRequest, NextResponse } from "next/server";
import { getDb, bootstrapSchema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await bootstrapSchema();
  const db = getDb();
  const rows = await db`SELECT id, password_hash FROM users WHERE username = ${username}`;
  const user = rows[0] as { id: string; password_hash: string } | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, username });
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
