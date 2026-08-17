# Synapse Notes 🧠✍️

> An AI-native note-taking application built for tablet handwriting (Samsung Tab S-Pen), PDF slide annotations, and two-way integration with AI agents (Claude Code, Codex, Antigravity) via Model Context Protocol (MCP).

---

## 📁 Repository Structure

```
.
├── docs/                      # Official Documentation
│   ├── prd.md                 # Product Requirements Document (v1.0)
│   ├── architecture.md        # System Architecture & Technical Specifications
│   ├── mcp-spec.md            # Model Context Protocol (MCP) tool contract
│   └── changes.md             # Changelog & Version History
├── plan/                      # Project Planning & Roadmaps
│   ├── roadmap.md             # Phased execution milestones
│   └── features_breakdown.md  # Detailed feature specifications
└── README.md                  # Project Overview
```

---

## 🌟 Key Highlights

- **S-Pen Canvas Engine**: Ultra-low latency handwriting, highlighters, shape auto-snapping, and palm rejection.
- **PDF Slide Annotation**: Open lecture slides, scribble over diagrams, and export annotated PDFs.
- **AI Agent Bridge (MCP)**: AI agents like Claude Code and Codex can read notes, resolve classroom doubts, and insert interactive study cards directly into the notebook.
- **Single-Domain Full-Stack**: Built with Next.js for unified frontend, backend, and deployment on Vercel/Netlify.
