/**
 * Real-Time Collaboration & Presence Engine for Synapse Notes.
 *
 * Implements lightweight multi-peer state broadcast:
 * - Active room tracking per notebook
 * - Peer presence (name, color, last seen, cursor position)
 * - Stroke delta broadcasting across active sessions
 * - Conflict-free stroke append merging
 */

import { Stroke } from "./types";

export interface CollaboratorPeer {
  clientId: string;
  userId: string;
  username: string;
  color: string;
  cursor?: { x: number; y: number; pageNumber: number };
  lastActive: number;
}

export interface LiveBroadcastMessage {
  type: "peer_joined" | "peer_left" | "peer_cursor" | "stroke_added" | "stroke_deleted";
  clientId: string;
  username: string;
  notebookId: string;
  timestamp: number;
  payload?: {
    pageNumber?: number;
    stroke?: Stroke;
    strokeId?: string;
    cursor?: { x: number; y: number; pageNumber: number };
    peers?: CollaboratorPeer[];
  };
}

// In-memory room state (persists across requests within node process)
interface RoomState {
  peers: Map<string, CollaboratorPeer>;
  eventQueue: LiveBroadcastMessage[];
  lastActivity: number;
}

const rooms = new Map<string, RoomState>();

const PEER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
];

function getOrCreateRoom(notebookId: string): RoomState {
  let room = rooms.get(notebookId);
  if (!room) {
    room = {
      peers: new Map(),
      eventQueue: [],
      lastActivity: Date.now(),
    };
    rooms.set(notebookId, room);
  }
  return room;
}

export const liveCollaboration = {
  /** Register or heartbeat a peer in a notebook room */
  joinOrHeartbeat(
    notebookId: string,
    peer: { clientId: string; userId: string; username: string; cursor?: { x: number; y: number; pageNumber: number } }
  ): CollaboratorPeer[] {
    const room = getOrCreateRoom(notebookId);
    const now = Date.now();

    // Clean stale peers (> 30s inactivity)
    for (const [id, p] of room.peers.entries()) {
      if (now - p.lastActive > 30000) {
        room.peers.delete(id);
        room.eventQueue.push({
          type: "peer_left",
          clientId: id,
          username: p.username,
          notebookId,
          timestamp: now,
        });
      }
    }

    const existing = room.peers.get(peer.clientId);
    const color = existing
      ? existing.color
      : PEER_COLORS[room.peers.size % PEER_COLORS.length];

    const updatedPeer: CollaboratorPeer = {
      clientId: peer.clientId,
      userId: peer.userId,
      username: peer.username,
      color,
      cursor: peer.cursor || existing?.cursor,
      lastActive: now,
    };

    const isNew = !existing;
    room.peers.set(peer.clientId, updatedPeer);
    room.lastActivity = now;

    if (isNew) {
      room.eventQueue.push({
        type: "peer_joined",
        clientId: peer.clientId,
        username: peer.username,
        notebookId,
        timestamp: now,
        payload: { peers: Array.from(room.peers.values()) },
      });
    }

    // Keep event queue bounded (last 100 messages)
    if (room.eventQueue.length > 100) {
      room.eventQueue = room.eventQueue.slice(-100);
    }

    return Array.from(room.peers.values());
  },

  /** Broadcast a new stroke drawn by a peer */
  broadcastStroke(
    notebookId: string,
    clientId: string,
    username: string,
    pageNumber: number,
    stroke: Stroke
  ) {
    const room = getOrCreateRoom(notebookId);
    const now = Date.now();

    const msg: LiveBroadcastMessage = {
      type: "stroke_added",
      clientId,
      username,
      notebookId,
      timestamp: now,
      payload: { pageNumber, stroke },
    };

    room.eventQueue.push(msg);
    room.lastActivity = now;

    if (room.eventQueue.length > 100) {
      room.eventQueue = room.eventQueue.slice(-100);
    }
  },

  /** Broadcast cursor movement */
  broadcastCursor(
    notebookId: string,
    clientId: string,
    username: string,
    cursor: { x: number; y: number; pageNumber: number }
  ) {
    const room = getOrCreateRoom(notebookId);
    const peer = room.peers.get(clientId);
    if (peer) {
      peer.cursor = cursor;
      peer.lastActive = Date.now();
    }
  },

  /** Fetch all events since a given timestamp */
  getEventsSince(notebookId: string, sinceTimestamp: number): {
    events: LiveBroadcastMessage[];
    activePeers: CollaboratorPeer[];
  } {
    const room = getOrCreateRoom(notebookId);
    const events = room.eventQueue.filter((e) => e.timestamp > sinceTimestamp);
    return {
      events,
      activePeers: Array.from(room.peers.values()),
    };
  },

  /** Disconnect peer */
  leave(notebookId: string, clientId: string) {
    const room = rooms.get(notebookId);
    if (!room) return;
    const peer = room.peers.get(clientId);
    if (peer) {
      room.peers.delete(clientId);
      room.eventQueue.push({
        type: "peer_left",
        clientId,
        username: peer.username,
        notebookId,
        timestamp: Date.now(),
      });
    }
  },
};
