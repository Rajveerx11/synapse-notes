# Architecture Decision Records (ADRs) — Synapse Notes

This document records the architectural and engineering decisions made during the design and evolution of **Synapse Notes**. Each record describes the problem, the decision taken, and the rationale behind it in simple, concise language.

---

## Table of Contents
1. [ADR-001: Next.js App Router & Serverless Architecture](#adr-001-nextjs-app-router--serverless-architecture)
2. [ADR-002: Dual-Canvas Layering (DOM Content + Transparent Drawing Canvas)](#adr-002-dual-canvas-layering-dom-content--transparent-drawing-canvas)
3. [ADR-003: Model Context Protocol (MCP) Server for AI Integration](#adr-003-model-context-protocol-mcp-server-for-ai-integration)
4. [ADR-004: Server-Side & Client-Side Vector PDF Baking with pdf-lib](#adr-004-server-side--client-side-vector-pdf-baking-with-pdf-lib)
5. [ADR-005: Line-Anchored Code Annotations](#adr-005-line-anchored-code-annotations)
6. [ADR-006: In-Browser Python Execution with Pyodide (WebAssembly)](#adr-006-in-browser-python-execution-with-pyodide-webassembly)
7. [ADR-007: Serialized Cell JSON inside Existing Storage Schema](#adr-007-serialized-cell-json-inside-existing-storage-schema)
8. [ADR-008: SuperMemo-2 (SM-2) Algorithm for AI Flashcard Spaced Repetition](#adr-008-supermemo-2-sm-2-algorithm-for-ai-flashcard-spaced-repetition)

---

### ADR-001: Next.js App Router & Serverless Architecture
- **Date:** 2026-02-15
- **Status:** Accepted
- **Decision:** Build Synapse Notes using Next.js App Router with PostgreSQL (Neon Serverless) and a local JSON fallback engine.
- **Why:** 
  - Allows full-stack capabilities (React 19 UI + Serverless API routes) in a single unified codebase.
  - Zero-maintenance database scaling with Neon Serverless Postgres.
  - Local JSON fallback guarantees that the application works seamlessly out-of-the-box in local development and offline without mandatory database setup.

---

### ADR-002: Dual-Canvas Layering (DOM Content + Transparent Drawing Canvas)
- **Date:** 2026-02-18
- **Status:** Accepted
- **Decision:** Separate interactive text/PDF/code rendering in the DOM from handwritten ink strokes rendered on top via transparent HTML5 Canvas layers.
- **Why:**
  - Preserves native text selection, copy-paste, accessibility, syntax highlighting, and keyboard editing.
  - Enables smooth, 60fps stylus drawing (pressure sensitivity, pen, highlighter) directly over content without interfering with underlying DOM interactions.

---

### ADR-003: Model Context Protocol (MCP) Server for AI Integration
- **Date:** 2026-02-22
- **Status:** Accepted
- **Decision:** Implement a standalone Model Context Protocol (MCP) server over standard I/O (stdio) using `@modelcontextprotocol/sdk`.
- **Why:**
  - Allows AI assistants (Claude Code, Gemini CLI, Cursor, Antigravity) to query notebook contents, read student notes, and inject study cards/flashcards directly into user notebooks during study sessions.
  - Standardized protocol means any compatible LLM tool can interact with Synapse Notes without custom API integrations.

---

### ADR-004: Server-Side & Client-Side Vector PDF Baking with pdf-lib
- **Date:** 2026-02-25
- **Status:** Accepted
- **Decision:** Use `pdf-lib` to bake ink strokes as true vector Bézier curves directly into PDF document streams rather than flattening pages to low-resolution raster images.
- **Why:**
  - Keeps exported PDFs crisp at any zoom level with vector resolution.
  - Results in dramatically smaller file sizes compared to PNG rasterization.
  - Retains original searchable text within the exported PDF.

---

### ADR-005: Line-Anchored Code Annotations
- **Date:** 2026-03-01
- **Status:** Accepted
- **Decision:** Anchor handwritten annotations to specific line numbers in code editor blocks (`anchor_line`, `line_offset_y`).
- **Why:**
  - If a user adds or removes lines of code above an annotation, the drawing strokes shift vertically with the referenced code rather than getting misaligned.

---

### ADR-006: In-Browser Python Execution with Pyodide (WebAssembly)
- **Date:** 2026-03-10
- **Status:** Accepted
- **Decision:** Run Python and Jupyter Notebook code cells client-side inside the browser using Pyodide (CPython compiled to WebAssembly).
- **Why:**
  - **Zero Server Costs & Security:** No need for expensive, dangerous remote code execution Docker containers on the server.
  - **Privacy:** User machine learning data and Python code never leave their machine.
  - **Ecosystem Support:** Built-in support for NumPy, Pandas, Matplotlib, and core data science libraries directly in the browser.

---

### ADR-007: Serialized Cell JSON inside Existing Storage Schema
- **Date:** 2026-03-10
- **Status:** Accepted
- **Decision:** Store Jupyter multi-cell notebook data (markdown, code cells, execution outputs) serialized inside the existing `Page.code_content` column with `code_language = "jupyter"`.
- **Why:**
  - **Zero Breaking Changes:** Avoids costly and risky database schema migrations on existing production PostgreSQL databases.
  - **Compatibility:** Works transparently with existing offline sync queues, localStorage caches, and backup exports.

---

### ADR-008: SuperMemo-2 (SM-2) Algorithm for AI Flashcard Spaced Repetition
- **Date:** 2026-03-05
- **Status:** Accepted
- **Decision:** Implement the SM-2 spaced repetition algorithm for reviewing AI-generated study cards and diagrams.
- **Why:**
  - Proven cognitive science approach to long-term memory retention.
  - Adapts card review intervals dynamically based on student difficulty ratings (1 to 5).
