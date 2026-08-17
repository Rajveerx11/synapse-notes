#!/usr/bin/env node
/**
 * Synapse Notes — MCP Server
 *
 * Exposes 4 tools to Claude Code, Codex, and Antigravity:
 *   1. list_notebooks        — List all notebooks
 *   2. get_page_content      — Get full content of a page
 *   3. search_notes          — Search across all notes
 *   4. insert_ai_study_card  — Write a study card to a page
 *
 * Usage:
 *   SYNAPSE_API_KEY=your_key SYNAPSE_BASE_URL=https://your-app.vercel.app node index.js
 *
 * Add to claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "synapse-notes": {
 *         "command": "node",
 *         "args": ["/path/to/mcp-server/index.js"],
 *         "env": {
 *           "SYNAPSE_API_KEY": "your_key",
 *           "SYNAPSE_BASE_URL": "http://localhost:3000"
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.SYNAPSE_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.SYNAPSE_API_KEY || "";

if (!API_KEY) {
  process.stderr.write("WARNING: SYNAPSE_API_KEY is not set\n");
}

async function apiRequest(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ data: unknown }>;
}

const server = new McpServer({
  name: "synapse-notes",
  version: "1.0.0",
});

// ── Tool 1: list_notebooks ──────────────────────────────────────────
server.tool(
  "list_notebooks",
  "List all notebooks in Synapse Notes. Returns notebook IDs, titles, subjects, and page counts.",
  {},
  async () => {
    const { data } = await apiRequest("/api/notebooks");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool 2: get_page_content ────────────────────────────────────────
server.tool(
  "get_page_content",
  "Get the full content of a specific notebook page including handwritten text, slide PDF info, and any AI study cards on that page.",
  {
    notebook_id: z.string().describe("The ID of the notebook"),
    page_number: z.number().int().min(1).describe("The page number (1-based)"),
  },
  async ({ notebook_id, page_number }) => {
    const { data } = await apiRequest(`/api/notebooks/${notebook_id}?full=true`);
    const notebook = data as {
      notebook: { title: string; subject: string };
      pages: Array<{
        page_number: number;
        text_content: string;
        strokes_json: string;
        pdf_url: string | null;
        pdf_page: number | null;
      }>;
    };

    const page = notebook.pages?.find((p) => p.page_number === page_number);
    if (!page) {
      return { content: [{ type: "text", text: `Page ${page_number} not found` }] };
    }

    const cardsRes = await apiRequest(
      `/api/notebooks/${notebook_id}/cards?page=${page_number}`
    );

    const result = {
      notebook_title: notebook.notebook?.title,
      subject: notebook.notebook?.subject,
      page_number,
      text_content: page.text_content,
      has_pdf: !!page.pdf_url,
      pdf_page: page.pdf_page,
      stroke_count: JSON.parse(page.strokes_json || "[]").length,
      ai_cards: cardsRes.data,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 3: search_notes ────────────────────────────────────────────
server.tool(
  "search_notes",
  "Search across all handwritten notes, lecture slides, and AI study cards in Synapse Notes.",
  {
    query: z.string().describe("Search query — topic, keyword, or concept (e.g. 'backpropagation', 'attention mechanism')"),
  },
  async ({ query }) => {
    const { data } = await apiRequest(
      `/api/search?q=${encodeURIComponent(query)}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool 4: insert_ai_study_card ────────────────────────────────────
server.tool(
  "insert_ai_study_card",
  "Insert an AI-generated study card directly onto a notebook page. The card supports markdown, LaTeX math ($ and $$), and Mermaid diagrams.",
  {
    notebook_id: z.string().describe("The ID of the target notebook"),
    page_number: z.number().int().min(1).describe("The page number to add the card to (1-based)"),
    title: z.string().describe("Card headline (e.g. 'How Backpropagation Works')"),
    content: z.string().describe("Card body in Markdown. Use $...$ for inline math and $$...$$ for block equations."),
    diagram_type: z
      .enum(["none", "mermaid"])
      .optional()
      .default("none")
      .describe("Type of diagram to render"),
    diagram_data: z
      .string()
      .optional()
      .default("")
      .describe("Mermaid diagram source code (if diagram_type is 'mermaid')"),
  },
  async ({ notebook_id, page_number, title, content, diagram_type, diagram_data }) => {
    const { data } = await apiRequest(`/api/notebooks/${notebook_id}/cards`, {
      method: "POST",
      body: JSON.stringify({
        page_number,
        title,
        content,
        diagram_type: diagram_type ?? "none",
        diagram_data: diagram_data ?? "",
      }),
    });

    return {
      content: [
        {
          type: "text",
          text: `✅ Study card inserted successfully!\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }
);

// ── Start server ────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("Synapse Notes MCP Server running on stdio\n");
