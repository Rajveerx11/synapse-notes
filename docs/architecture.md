# System Architecture - Synapse Notes

This document describes the high-level architecture, component hierarchy, data flow, and API contracts for **Synapse Notes**.

---

## 1. System Overview

```
+-----------------------------------------------------------------------+
|                       Samsung Galaxy Tab / Web UI                     |
|                                                                       |
|  +---------------------+   +---------------------+   +-------------+  |
|  |  S-Pen Canvas Engine|   | PDF Overlay Viewer  |   | AI Study    |  |
|  |  (Pressure/Tilt/Ink)|   | (PDF.js / WebGL)    |   | Card Deck   |  |
|  +----------+----------+   +----------+----------+   +------+------+  |
+-------------|-------------------------|---------------------|---------+
              |                         |                     |
              v                         v                     v
+-----------------------------------------------------------------------+
|                   Next.js App Router (Single Domain)                  |
|                                                                       |
|   /api/notes            /api/pdf          /api/ai/cards    /api/mcp   |
+-----------------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
|                          Data Storage Layer                           |
|       (Structured Blocks: JSON Ink + Markdown + PDF Blobs)           |
+-----------------------------------------------------------------------+
                                  ^
                                  | (Secure API Key)
+---------------------------------+-------------------------------------+
|                  SmartNotebook MCP Server Bridge                      |
|                                                                       |
|     Codex               Claude Code               Antigravity         |
+-----------------------------------------------------------------------+
```

---

## 2. Component Layers

### 2.1. Client / Frontend Layer
- **Framework**: Next.js 14+ / React 18+ (App Router).
- **Styling**: Vanilla CSS / Modern CSS design tokens (fast, responsive, zero overhead).
- **Drawing Canvas**: HTML5 Canvas with Pointer Events API for low-latency S-Pen tracking (`e.pointerType === 'pen'`, `e.pressure`, `e.tiltX`, `e.tiltY`).
- **PDF Engine**: PDF.js rendering pipeline for multi-page slide viewing with synchronized annotation layers.
- **Math & Markdown**: KaTeX for LaTeX mathematical formulas and markdown rendering for AI study cards.

### 2.2. Backend / API Layer (Next.js Serverless Routes)
- `/api/notebooks`: Manage notebooks, folders, and metadata.
- `/api/notes/[id]`: Retrieve and save page blocks (ink strokes, text, PDF state).
- `/api/pdf/upload`: Upload and process PDF lecture slides.
- `/api/ai/cards`: Insert, update, and fetch AI study cards.
- `/api/mcp`: Internal REST endpoint consumed by the MCP server.

### 2.3. AI Agent Integration Layer (MCP Server)
- Standard Model Context Protocol (MCP) server running via stdio or SSE.
- Exposes tools to Codex, Claude Code, and Antigravity.
- Authenticates using `SYNAPSE_API_KEY`.
