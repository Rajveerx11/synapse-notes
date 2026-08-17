# Changelog & Version History

All notable changes to the **Synapse Notes** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-08-17

### Added
- **S-Pen Canvas Engine**: Pressure-sensitive stylus drawing, palm rejection, highlighter (multiply blend mode), stroke eraser, and auto-save.
- **Annotated PDF Canvas**: Open multi-page PDF slides, draw directly on top of slides, and export merged vector annotated PDFs.
- **AI Study Cards**: Slide-in drawer with KaTeX LaTeX math rendering (`$...$` and `$$...$$`) and Mermaid diagram rendering.
- **Model Context Protocol (MCP) Server**: Standalone MCP server with 4 tools (`list_notebooks`, `get_page_content`, `search_notes`, `insert_ai_study_card`) for Claude Code, Codex, and Antigravity.
- **Authentication**: JWT cookie-based session management with register/login/logout and API key support for MCP.
- **Dark/Light Theme**: CSS variable design system with persistent theme toggle.
- **PWA Support**: Web manifest and icons for home-screen tablet installation.

### Fixed
- Added auto-generated PWA icons (`icon-192.png`, `icon-512.png`) and `favicon.ico`.
- Implemented resilient `dbService` with serverless fallback to prevent 500 crashes.
- Hardened client-side data fetching with defensive JSON parsing.
