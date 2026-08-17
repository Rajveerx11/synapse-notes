import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = (body.username || "").trim();
    const password = body.password || "";

    if (!username || !password || username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: "Username ≥ 3 chars and password ≥ 6 chars required" },
        { status: 400 }
      );
    }

    const existing = await dbService.findUserByUsername(username);
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const id = uuid();
    const password_hash = await bcrypt.hash(password, 12);
    const user = await dbService.createUser(id, username, password_hash);

    const token = await signToken({ userId: user.id, username: user.username });
    const res = NextResponse.json({ ok: true });
    res.cookies.set("synapse_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
