# MCP Server Setup Guide

Connect **Claude Code**, **Codex**, and **Antigravity** to your live Synapse Notes notebooks.

---

## 1. Production URL & API Credentials

* **Primary Production URL:** `https://synapse-notes-iota.vercel.app`
* **Alternate URL:** `https://synapse-notes-rajveerx11s-projects.vercel.app`
* **API Key:** `synapse_sec_89f2a93c71e28b14a`
* **MCP Server Script:** `C:/Note-Taking/mcp-server/dist/index.js`

---

## 2. Connect Claude Desktop / Claude Code

Add the following to your Claude configuration file:
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "synapse-notes": {
      "command": "node",
      "args": ["C:/Note-Taking/mcp-server/dist/index.js"],
      "env": {
        "SYNAPSE_API_KEY": "synapse_sec_89f2a93c71e28b14a",
        "SYNAPSE_BASE_URL": "https://synapse-notes-iota.vercel.app"
      }
    }
  }
}
```

---

## 3. Connect Antigravity

In Antigravity's MCP Settings / Config:
1. Add a new MCP server named `synapse-notes`.
2. Set Command to: `node C:/Note-Taking/mcp-server/dist/index.js`
3. Add Environment Variables:
   - `SYNAPSE_API_KEY`: `synapse_sec_89f2a93c71e28b14a`
   - `SYNAPSE_BASE_URL`: `https://synapse-notes-iota.vercel.app`

---

## 4. Connect Codex CLI or Custom Terminal Agent

Run the MCP server directly over stdio:
```bash
SYNAPSE_API_KEY=synapse_sec_89f2a93c71e28b14a SYNAPSE_BASE_URL=https://synapse-notes-iota.vercel.app node C:/Note-Taking/mcp-server/dist/index.js
```

---

## 5. Available Tools

| Tool | Parameters | Description |
|---|---|---|
| `list_notebooks` | *None* | List all subjects, folders, and notebooks. |
| `get_page_content` | `notebook_id`, `page_number` | Retrieve full page context: slides, handwriting, and attached AI cards. |
| `search_notes` | `query` | Search across all notes, handwriting, and slides. |
| `insert_ai_study_card` | `notebook_id`, `page_number`, `title`, `content`, `diagram_type`, `diagram_data` | Inject formatted study cards with LaTeX equations ($...$) and Mermaid diagrams directly onto the student's notebook page. |
