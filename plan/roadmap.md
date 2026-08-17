# Development Roadmap - Synapse Notes v1.0

A phased execution plan for building the AI-connected note-taking application.

---

## Phase 1: Foundation & Drawing Engine (Week 1)
- [ ] Initialize Next.js 14+ full-stack project with TypeScript.
- [ ] Set up clean CSS design system and responsive layout (Tablet + Laptop).
- [ ] Build S-Pen optimized Drawing Canvas (smooth pen, highlighter, eraser, shapes, palm rejection).
- [ ] Implement undo/redo and local vector storage.

---

## Phase 2: PDF Slide Viewer & Annotations (Week 2)
- [ ] Implement multi-page PDF uploader and viewer.
- [ ] Overlay transparent annotation layer on top of PDF slides.
- [ ] Build annotated PDF export engine (download merged PDF with handwriting).

---

## Phase 3: AI Study Cards & Math Rendering (Week 3)
- [ ] Create AI Study Card component with KaTeX LaTeX math support.
- [ ] Implement Diagram rendering (Mermaid.js charts, neural network diagrams).
- [ ] Build in-app "Ask AI" assistant for fast classroom doubt resolution.

---

## Phase 4: Model Context Protocol (MCP) Server (Week 4)
- [ ] Build standalone MCP server package (`packages/mcp-server`).
- [ ] Connect MCP server to Next.js API with secure token authentication.
- [ ] Test end-to-end integration with Claude Code and Codex.

---

## Phase 5: Polish, PWA, & Deployment
- [ ] Configure PWA manifest and service worker for offline tablet support.
- [ ] Deploy full-stack app to Vercel / Netlify.
- [ ] Conduct end-to-end testing on Samsung Galaxy Tab S-Pen.
