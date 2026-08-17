# MCP Server Setup Guide

Connect **Claude Code**, **Codex**, and **Antigravity** to your Synapse Notes notebooks.

## 1. Get Your API Key

Copy `SYNAPSE_API_KEY` from your `.env.local` file (or set a new one in production).

## 2. Connect Claude Desktop / Claude Code

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "synapse-notes": {
      "command": "node",
      "args": ["C:/Note-Taking/mcp-server/index.ts"],
      "env": {
        "SYNAPSE_API_KEY": "synapse_dev_key_change_in_production",
        "SYNAPSE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

> For production, replace `SYNAPSE_BASE_URL` with your Vercel/Netlify URL.

## 3. Connect Antigravity

In Antigravity's MCP config panel, add:
- **Command**: `node C:/Note-Taking/mcp-server/index.ts`
- **Env vars**: `SYNAPSE_API_KEY` and `SYNAPSE_BASE_URL`

## 4. Available Tools

| Tool | Description |
|---|---|
| `list_notebooks` | List all notebooks with their IDs, titles, and subjects |
| `get_page_content(notebook_id, page_number)` | Get full content of a page — text, PDF info, and AI cards |
| `search_notes(query)` | Search across all notes and cards |
| `insert_ai_study_card(notebook_id, page_number, title, content, ...)` | Write a study card directly onto a notebook page |

## 5. Example Agent Prompts

**Ask Claude to explain a topic from your notes:**
> *"Use synapse-notes to find my lecture on Backpropagation and explain the math behind gradient descent in simple terms. Then insert a study card on that page."*

**Ask Codex to add a Python code example:**
> *"Search my Synapse Notes for 'neural network' and add a study card on that page with a working Python code snippet for a simple 2-layer MLP using PyTorch."*
