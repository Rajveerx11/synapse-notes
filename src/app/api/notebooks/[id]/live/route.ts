import { NextRequest, NextResponse } from "next/server";
import { liveCollaboration } from "@/lib/collaboration";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/notebooks/[id]/live?since=<timestamp>&clientId=<id>
 * Returns new stroke deltas and active peer presence list.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const since = Number(searchParams.get("since") || "0");
    const clientId = searchParams.get("clientId") || "";

    if (clientId) {
      liveCollaboration.joinOrHeartbeat(id, {
        clientId,
        userId: session.userId,
        username: session.username,
      });
    }

    const { events, activePeers } = liveCollaboration.getEventsSince(id, since);

    return NextResponse.json({
      data: {
        events,
        activePeers,
        timestamp: Date.now(),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/**
 * POST /api/notebooks/[id]/live
 * Action types:
 *  - "heartbeat": registers or updates peer cursor
 *  - "stroke": broadcasts a drawn stroke
 *  - "leave": removes peer
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { action, clientId, pageNumber, stroke, cursor } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    if (action === "heartbeat") {
      const peers = liveCollaboration.joinOrHeartbeat(id, {
        clientId,
        userId: session.userId,
        username: session.username,
        cursor,
      });
      return NextResponse.json({ data: { peers, timestamp: Date.now() } });
    }

    if (action === "stroke" && stroke && pageNumber) {
      liveCollaboration.broadcastStroke(id, clientId, session.username, pageNumber, stroke);
      return NextResponse.json({ data: { success: true, timestamp: Date.now() } });
    }

    if (action === "cursor" && cursor) {
      liveCollaboration.broadcastCursor(id, clientId, session.username, cursor);
      return NextResponse.json({ data: { success: true } });
    }

    if (action === "leave") {
      liveCollaboration.leave(id, clientId);
      return NextResponse.json({ data: { success: true } });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
