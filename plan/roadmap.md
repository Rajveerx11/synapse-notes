# Development Roadmap — Synapse Notes

Comprehensive roadmap detailing completed milestones and strategic future releases.

---

## 🏁 Phase 1: MVP & Core Foundation (v1.0.0 — COMPLETED ✅)

- [x] **Next.js Full-Stack Architecture**: Next.js 16 with App Router, serverless route handlers, and SSR.
- [x] **S-Pen Canvas Engine**: Ultra-low latency handwriting, hardware pressure sensitivity, palm rejection, 8-color palette, highlighter with multiply blend mode.
- [x] **Annotated PDF Canvas**: PDF slide import, multi-page slide navigation, direct vector drawing on top of slides, and server-side vector baking (`pdf-lib`) for downloadable PDF exports.
- [x] **AI Study Deck**: Slide-in drawer with KaTeX LaTeX math typesetting ($...$ and $$...$$) and Mermaid.js dynamic flowcharts.
- [x] **Cloud Persistence (Neon PostgreSQL)**: Database schema for users, notebooks, pages, AI cards, and PDF binary storage with connection pooling.
- [x] **Model Context Protocol (MCP) Server**: Standalone compiled server (`mcp-server/dist/index.js`) exposing 4 tools to Claude Code, Codex, and Antigravity.
- [x] **PWA Installation**: Manifest, icons, standalone mobile navigation, and tablet responsiveness.
- [x] **Live Vercel Production Deployment**: Aliased to [https://synapse-notes-iota.vercel.app](https://synapse-notes-iota.vercel.app).

---

## 🚀 Phase 2: Collaboration & Enhanced Ink (v1.1.0 — In Progress)

- [ ] **Vector Shape Auto-Snapping**: Draw rough rectangles, ellipses, and arrows with automatic Bézier smoothing.
- [ ] **Lasso Selection & Transform**: Lasso select handwriting strokes to move, resize, recolor, or copy.
- [ ] **Audio Lecture Recording Sync**: Synchronized voice recording timestamped against handwritten strokes.
- [ ] **Dual-Page Split Screen**: Side-by-side mode (lecture slide on left, blank scribble scratchpad on right).

---

## 🌌 Phase 3: Autonomous AI & Multimodal Intelligence (v2.0.0 — Planned)

- [ ] **Handwriting OCR & Math Recognition Engine**: On-device handwriting recognition turning handwritten equations directly into editable LaTeX.
- [ ] **Autonomous Exam Prep Agent**: AI agent that reads an entire notebook and generates interactive flashcards, practice quizzes, and formula cheat sheets.
- [ ] **Real-Time WebRTC Canvas Sync**: Collaborative note-taking with study groups in real time.
- [ ] **Obsidian & Notion Bidirectional Sync**: Export notebooks directly into personal second-brain vaults.
