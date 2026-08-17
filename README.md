# Synapse Notes 🧠✍️

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-4169E1?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=for-the-badge&logo=vercel)](https://synapse-notes-iota.vercel.app)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-MCP%20Ready-purple?style=for-the-badge)](https://modelcontextprotocol.io/)

**An AI-native digital notebook tailored for tablet handwriting (Samsung Tab S-Pen), PDF slide markup, and two-way integration with AI agents (Claude Code, Codex, Antigravity) via the Model Context Protocol (MCP).**

[Live Application](https://synapse-notes-iota.vercel.app) • [Architecture Guide](docs/architecture.md) • [Cloudflare R2 Storage Guide](docs/cloud-storage-guide.md) • [MCP Server Setup](docs/MCP_SETUP.md) • [API Reference](docs/api-reference.md) • [Tablet Guide](docs/tablet-guide.md)

</div>

---

## 🌟 Overview

Traditional note-taking applications (GoodNotes, Samsung Notes, Notability) trap your handwritten notes inside proprietary files or flat image exports. 

**Synapse Notes** treats handwriting and lecture slides as **structured, composable data blocks**. Through an open **Model Context Protocol (MCP)** server, your AI coding and reasoning agents (such as **Claude Code**, **Codex**, and **Antigravity**) have live, two-way access to your notebook:

1. **In the Classroom:** Scribble notes with pressure sensitivity, annotate lecture slides, and draw neural network diagrams using your Samsung S-Pen or stylus.
2. **On Your Laptop:** Ask your AI agent complex questions about your lecture (*"Explain the attention mechanism from my Lecture 4 slides"*).
3. **Automated Study Decks:** Your AI agent inspects your notes, solves doubts, and writes interactive study cards with LaTeX math ($...$) and Mermaid diagrams directly back into your notebook in real time.

---

## 📸 Key Features

```
                                  SYNAPSE NOTES ECOSYSTEM
                                  
   📱 Samsung Tab / Web PWA               🧠 AI Agents (Laptop / CLI)
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ • S-Pen Pressure Ink      │         │ • Claude Code             │
 │ • PDF Slide Annotation    │ ◄─────► │ • OpenAI Codex            │
 │ • AI Study Cards (LaTeX)  │   MCP   │ • Antigravity IDE         │
 │ • Dark & Light Themes     │  Bridge │ • Custom Autonomous LLMs  │
 └─────────────┬─────────────┘         └─────────────┬─────────────┘
               │                                     │
               ▼                                     ▼
        ┌───────────────────────────────────────────────────┐
        │       Next.js App Server (Single-Domain)          │
        │          PostgreSQL (Neon Cloud Storage)          │
        └───────────────────────────────────────────────────┘
```

### 1. ✍️ S-Pen & Stylus Canvas Engine
* **Ultra-low latency** drawing using HTML5 Pointer Events API (`pointerdown`, `pointermove`, `pointerup`).
* Hardware **pressure-sensitivity** ($0.0 \to 1.0$) dynamically adjusting pen stroke width.
* Native **palm rejection** (`pointerType === 'pen'`) for resting hand while writing.
* **Palette:** Ballpoint pen (8 curated colors + custom hex picker), highlighter (multiply blend mode), stroke eraser, 4 line weights.

### 2. 📄 Draw Directly on PDFs & Vector Export
* Upload lecture slides, research papers, and homework assignments.
* Canvas automatically matches the aspect ratio and resolution of the underlying PDF.
* Draw arrows, underline formulas, and circle key concepts directly on top of slides.
* **One-Click Vector Export:** Merges handwriting strokes into the PDF using `pdf-lib` and generates a downloadable annotated document.

### 3. 🃏 Interactive AI Study Cards
* Slide-in study deck displaying AI-generated explanations and summaries.
* **KaTeX LaTeX Engine:** High-performance mathematical typesetting for formulas (e.g. $L_{BCE} = -y \log(\hat{y}) - (1-y) \log(1-\hat{y})$).
* **Mermaid.js Flowcharts:** Interactive diagrams and architectural flowcharts rendered dynamically.

### 4. 🔌 Universal Model Context Protocol (MCP) Server
* Standalone compiled MCP package in `mcp-server/dist/index.js`.
* Exposes 4 standardized tools:
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

## 📂 Project Architecture

```
synapse-notes/
├── docs/                       # Comprehensive Documentation
│   ├── architecture.md         # System Architecture & Technical Specifications
│   ├── prd.md                  # Product Requirements Document (v1.0)
│   ├── mcp-spec.md             # Model Context Protocol Tool Interface Spec
│   ├── MCP_SETUP.md            # Step-by-Step AI Agent Integration Guide
│   ├── api-reference.md        # REST API Endpoints & Schemas
│   ├── tablet-guide.md         # Samsung Tab / PWA Optimization Guide
│   └── changes.md              # Semantic Changelog & Version History
├── mcp-server/                 # Standalone Model Context Protocol Package
│   ├── index.ts                # MCP Server Implementation
│   ├── package.json            # MCP SDK Dependencies
│   └── tsconfig.json           # MCP TypeScript Compiler Options
├── plan/                       # Strategic Planning & Roadmaps
│   ├── roadmap.md              # Milestone Execution Plan
│   └── features_breakdown.md   # Modular Feature Breakdown
├── src/                        # Next.js Application Source
│   ├── app/                    # Next.js 16 App Router
│   │   ├── api/                # Serverless API Endpoints (Auth, Notes, PDF, Search)
│   │   ├── login/              # Authentication UI (Register/Login)
│   │   ├── notebook/[id]/      # Notebook & Canvas Interface
│   │   └── page.tsx            # Student Dashboard
│   ├── components/             # Reusable UI & Canvas Components
│   │   ├── AnnotatedPDFCanvas  # Unified PDF + S-Pen Overlay Canvas
│   │   ├── Canvas.tsx          # Blank S-Pen Drawing Canvas
│   │   ├── DashboardClient.tsx # Notebook Manager & Quick Create
│   │   ├── StudyCard.tsx       # KaTeX & Mermaid Study Card Renderer
│   │   └── Toolbar.tsx         # Responsive Stylus Tool Palette
│   ├── lib/                    # Shared Utilities
│   │   ├── auth.ts             # JWT Session & Token Verification
│   │   ├── db.ts               # Universal PostgreSQL Cloud Adapter (Neon/Supabase)
│   │   └── types.ts            # TypeScript Type Definitions
│   └── proxy.ts                # Route Protection & Authentication Guard
└── public/                     # Static Assets & PWA Manifest
```

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
| **Database** | Neon Serverless PostgreSQL (`pg` + connection pooling) | Persistent cloud note storage & user sessions |
| **Authentication** | `jose` (JWT) + `bcryptjs` | HttpOnly cookie sessions + Bearer token MCP auth |
| **Deployment** | Vercel Serverless Edge Platform | Global low-latency CDN and serverless compute |

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
