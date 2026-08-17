<p align="center">
  <img src="public/synapse-logo.svg" alt="Synapse Notes Logo" width="100%" />
</p>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-4169E1?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![Vercel Blob](https://img.shields.io/badge/Storage-Vercel%20Blob%20%2F%20R2-000000?style=for-the-badge&logo=vercel)](https://vercel.com/docs/storage/vercel-blob)
[![MCP Ready](https://img.shields.io/badge/Model%20Context%20Protocol-MCP%20Ready-purple?style=for-the-badge)](https://modelcontextprotocol.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

**An open-source, AI-native digital notebook tailored for tablet handwriting (Samsung Tab S-Pen), PDF lecture markup, and bidirectional integration with AI coding agents (Claude Code, OpenAI Codex, Antigravity) via the Model Context Protocol (MCP).**

[Live Application](https://synapse-notes-iota.vercel.app) • [Architecture Guide](docs/architecture.md) • [Contributing Guide](CONTRIBUTING.md) • [MCP Setup](docs/MCP_SETUP.md) • [API Reference](docs/api-reference.md) • [Tablet Guide](docs/tablet-guide.md)

</div>

---

## 🌟 Why Synapse Notes?

Traditional note-taking applications (GoodNotes, Samsung Notes, Notability) trap your handwritten notes inside proprietary files or flat image exports. 

**Synapse Notes** treats handwriting, formulas, and lecture slides as **structured, composable data blocks**. Through an open **Model Context Protocol (MCP)** server, your AI coding and reasoning agents (such as **Claude Code**, **Codex**, and **Antigravity**) have live, two-way access to your notebook:

1. **In the Classroom:** Scribble notes with pressure sensitivity, annotate lecture slides, and draw diagrams using your Samsung S-Pen or stylus.
2. **On Your Laptop:** Ask your AI agent complex questions about your lecture (*"Explain the attention mechanism from my Lecture 4 slides"*).
3. **Automated Study Decks:** Your AI agent inspects your notes, solves doubts, and writes interactive study cards with LaTeX math ($...$) and Mermaid diagrams directly back into your notebook in real time.

---

## 📸 System Topology

```
                                  SYNAPSE NOTES ECOSYSTEM
                                  
   📱 Samsung Tab / Web PWA               🧠 AI Agents (Laptop / CLI)
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ • S-Pen Pressure Ink      │         │ • Claude Code             │
 │ • PDF Slide Annotation    │ ◄─────► │ • OpenAI Codex            │
 │ • AI Study Cards (LaTeX)  │   MCP   │ • Antigravity IDE         │
 │ • 4 Paper Templates       │  Bridge │ • Custom Autonomous LLMs  │
 └─────────────┬─────────────┘         └─────────────┬─────────────┘
               │                                     │
               ▼                                     ▼
        ┌───────────────────────────────────────────────────┐
        │       Next.js App Server (Single-Domain)          │
        │  PostgreSQL (Neon DB) + Cloud Storage (Blob / R2) │
        └───────────────────────────────────────────────────┘
```

---

## ✨ Core Features

### 1. ✍️ S-Pen & Stylus Canvas Engine
* **Ultra-low latency** drawing using HTML5 Pointer Events API (`pointerdown`, `pointermove`, `pointerup`).
* Hardware **pressure-sensitivity** ($0.0 \to 1.0$) dynamically adjusting pen stroke width in real-time.
* Native **palm rejection** (`pointerType === 'pen'`) allowing natural hand resting while writing.
* **Paper Templates:** Blank, Dot Grid, Lined Ruled, and Graph Grid paper backgrounds.
* **Stylus Toolbar:** Ballpoint pen (8 curated colors + custom hex wheel), highlighter (multiply blend mode), stroke eraser, 4 line weights, and dynamic brush preview.

### 2. 📄 Draw Directly on PDFs & Vector Export
* Upload lecture slides, research papers, and homework assignments.
* Canvas automatically matches the aspect ratio and resolution of the underlying PDF.
* Draw arrows, underline formulas, and circle key concepts directly on top of slides.
* **Interactive Export Modal:** Choose between replacing the original in your cloud notebook or downloading a fresh copy with custom renaming.
* **Vector Baking:** Merges handwriting strokes into the PDF using `pdf-lib` without raster resolution loss.

### 3. 🃏 Interactive AI Study Cards
* Slide-in study deck displaying AI-generated explanations, summaries, and quizzes.
* **KaTeX LaTeX Engine:** High-performance mathematical typesetting for formulas (e.g. $L_{BCE} = -y \log(\hat{y}) - (1-y) \log(1-\hat{y})$).
* **Mermaid.js Flowcharts:** Interactive diagrams and architectural flowcharts rendered dynamically.

### 4. 🔌 Universal Model Context Protocol (MCP) Server
* Standalone compiled MCP package in `mcp-server/dist/index.js`.
* Exposes 4 standardized tools for AI agents:
  * `list_notebooks`: Lists subjects, notebooks, and page counts.
  * `get_page_content`: Retrieves slides, transcribed handwriting, and AI cards.
  * `search_notes`: Full-text/concept search across your entire notebook library.
  * `insert_ai_study_card`: Injects new study cards with LaTeX equations and Mermaid diagrams directly onto a student's page.

---

## 🚀 Quickstart Guide

### Prerequisites
* **Node.js**: v18.17+ or v20+
* **npm** or **pnpm**
* **PostgreSQL** database (Free serverless database available at [Neon](https://neon.tech))

### 1. Clone & Install
```bash
git clone https://github.com/Rajveerx11/synapse-notes.git
cd synapse-notes
npm install
```

### 2. Configure Environment
Create a `.env.local` file in the project root:
```env
SYNAPSE_API_KEY="synapse_sec_your_api_key_here"
JWT_SECRET="synapse_jwt_secret_your_secret_here"
DATABASE_URL="postgresql://user:password@endpoint.neon.tech/neondb?sslmode=require"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser or tablet.

---

## 🔌 Connecting AI Agents (Claude Code, Codex, Antigravity)

### Claude Desktop / Claude Code
Add the following configuration to your `claude_desktop_config.json`:
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "synapse-notes": {
      "command": "node",
      "args": ["<PATH_TO_PROJECT>/mcp-server/dist/index.js"],
      "env": {
        "SYNAPSE_API_KEY": "synapse_sec_89f2a93c71e28b14a",
        "SYNAPSE_BASE_URL": "https://synapse-notes-iota.vercel.app"
      }
    }
  }
}
```

### Antigravity IDE
In Antigravity's MCP Settings:
1. Add server: `synapse-notes`
2. Command: `node <PATH_TO_PROJECT>/mcp-server/dist/index.js`
3. Environment variables:
   * `SYNAPSE_API_KEY`: `synapse_sec_89f2a93c71e28b14a`
   * `SYNAPSE_BASE_URL`: `https://synapse-notes-iota.vercel.app`

### Codex / Terminal CLI
```bash
SYNAPSE_API_KEY=synapse_sec_89f2a93c71e28b14a \
SYNAPSE_BASE_URL=https://synapse-notes-iota.vercel.app \
node mcp-server/dist/index.js
```

---

## 🤝 Contributing

We welcome contributions from everyone! Whether it's fixing bugs, adding new tools, improving documentation, or creating new paper templates, your help is appreciated.

Please see our **[Contributing Guide](CONTRIBUTING.md)** for details on our code style, Git workflow, and local development setup.

---

## 🛠️ Technology Stack

| Domain | Technology | Purpose |
|---|---|---|
| **Frontend Core** | Next.js 16 (App Router) + React 19 | SSR, dynamic routing, and fast client hydration |
| **Styling** | Modern CSS Variables & Design Tokens | Zero-runtime CSS with light/dark theme engine |
| **Stylus Engine** | HTML5 Canvas + Pointer Events API | High-frequency pressure sampling ($120\text{Hz}$) |
| **PDF Markup** | PDF.js + `pdf-lib` | Multi-page PDF rendering and server-side vector baking |
| **Math & Diagrams** | KaTeX + Mermaid.js | LaTeX formula formatting and dynamic architecture charts |
| **AI Protocol** | Model Context Protocol (`@modelcontextprotocol/sdk`) | Standardized bidirectional agent integration |
| **Database** | Neon Serverless PostgreSQL (`pg` + pooling) | Persistent cloud note storage & user sessions |
| **File Storage** | Vercel Blob / Cloudflare R2 | High-capacity cloud storage for lecture slides |
| **Authentication** | `jose` (JWT) + `bcryptjs` | HttpOnly cookie sessions + Bearer token MCP auth |
| **Deployment** | Vercel Serverless Edge Platform | Global low-latency CDN and serverless compute |

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
