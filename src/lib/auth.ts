import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "synapse_jwt_secret_change_in_production"
);

export async function signToken(payload: { userId: string; username: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { userId: string; username: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("synapse_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(req?: NextRequest) {
  // For API routes — check bearer token or cookie
  if (req) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      // Allow static API key for MCP server only if configured with non-empty secret
      const configuredKey = process.env.SYNAPSE_API_KEY?.trim();
      if (configuredKey && token === configuredKey) {
        return { userId: "mcp", username: "mcp-agent" };
      }
      return verifyToken(token);
    }
    // Check cookie
    const token = req.cookies.get("synapse_token")?.value;
    if (token) return verifyToken(token);
    return null;
  }
  return getSession();
}
