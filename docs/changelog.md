# Changelog — Synapse Notes

All notable changes to **Synapse Notes** will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Interactive Jupyter Notebooks (`.ipynb`) & Python Scripts (`.py`):**
  - Full multi-cell Jupyter notebook environment with Code cells and Markdown cells.
  - Native KaTeX $\LaTeX$ math rendering and formatted text preview for Markdown explanation cells.
  - Cell management toolbar (Add Code/Markdown Cell, Delete Cell, Move Up/Down, Clear Outputs, Restart Kernel).
  - Drag-and-drop file import for `.ipynb` and `.py` files.
- **In-Browser Python Execution Engine (Pyodide / WebAssembly):**
  - Zero-server client-side Python code execution directly in the browser via Pyodide WASM.
  - Live stdout/stderr capture and display under code cells.
  - Native Matplotlib / Seaborn chart capture rendered directly as high-resolution plots.
  - Persistent Python runtime state across multiple cell runs.
- **Drawing & Inking Annotation Layer for Notebooks:**
  - Integrated stylus, pen, and highlighter overlay canvas directly on top of code, markdown, and graphical outputs.
- **Jupyter & Python Export Suite:**
  - Export notebooks directly to standard `.ipynb` (Jupyter v4) compatible with Google Colab, VS Code, and JupyterLab.
  - Export to clean Python script (`.py`) with `# %%` cell markers.
  - Enhanced PDF export supporting multi-cell code layouts, executed plots, and baked vector handwriting.
- **Documentation:**
  - Created `docs/decisions.md` documenting Architectural Decision Records (ADRs).
  - Created `docs/changelog.md` to track project evolution.
  - Updated `docs/architecture.md` with the Pyodide WebAssembly and Jupyter serialization pipeline.

---

## [1.2.0] - 2026-03-05

### Added
- SuperMemo-2 (SM-2) spaced repetition system (SRS) for reviewing AI-generated study cards and diagrams.
- AI Lecture Summarization panel with key concepts, definitions, and follow-up study questions.
- Tesseract.js OCR engine for converting handwritten canvas notes to searchable text.
- Real-time peer-to-peer live collaboration sync and presence broadcast.
- Multi-format document export: Microsoft Word (`.docx`), PowerPoint (`.pptx`), and Excel (`.xlsx`).

---

## [1.1.0] - 2026-02-25

### Added
- Model Context Protocol (MCP) server for Claude Code, Codex, Antigravity, and Gemini agent integration.
- Vector PDF baking with `pdf-lib` embedding ink strokes as lossless Bézier vectors.
- Line-anchored code canvas with automatic vertical stroke offset tracking.
- Tagging and folder organization system.

---

## [1.0.0] - 2026-02-15

### Added
- Initial release of Synapse Notes.
- Next.js App Router full-stack architecture with Neon Serverless PostgreSQL and local JSON fallback.
- Smooth HTML5 Canvas inking engine with pen, highlighter, eraser, and lasso tools.
- Dual-canvas layer rendering with pressure sensitivity and palm rejection.
- PDF viewing, annotation, and export workflows.
- AI study card generator with Mermaid diagram support.
