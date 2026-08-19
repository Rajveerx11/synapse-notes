#!/usr/bin/env node
/**
 * Synapse Notes — MCP Server v2.0
 *
 * 9 tools for Claude Code, Codex, and Antigravity:
 *   1.  list_notebooks          — List all notebooks
 *   2.  get_page_content        — Get full content of a page
 *   3.  search_notes            — Full-text search across all notes
 *   4.  insert_ai_study_card    — Write a study card to a page
 *   5.  create_notebook         — Create a new notebook
 *   6.  delete_study_card       — Delete a study card by ID
 *   7.  annotate_page           — Add a highlight/underline/sticky annotation to a PDF page
 *   8.  get_notebook_summary    — Get AI lecture summary for a notebook page
 *   9.  list_lecture_summaries  — List all saved AI summaries for a notebook
 *
 * Usage:
 *   SYNAPSE_API_KEY=your_key SYNAPSE_BASE_URL=https://your-app.vercel.app node index.js
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
  version: "2.0.0",
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
  "Insert an AI-generated study card directly onto a notebook page. Supports markdown, LaTeX math ($ and $$), and Mermaid diagrams.",
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

// ── Tool 5: create_notebook ──────────────────────────────────────────
server.tool(
  "create_notebook",
  "Create a new notebook in Synapse Notes with a title and optional subject.",
  {
    title: z.string().min(1).describe("Notebook title (e.g. 'Machine Learning Lecture 3')"),
    subject: z.string().optional().default("").describe("Subject or course name (e.g. 'CS229 Stanford')"),
  },
  async ({ title, subject }) => {
    const { data } = await apiRequest("/api/notebooks", {
      method: "POST",
      body: JSON.stringify({ title, subject }),
    });
    return {
      content: [
        {
          type: "text",
          text: `✅ Notebook created!\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }
);

// ── Tool 6: delete_study_card ────────────────────────────────────────
server.tool(
  "delete_study_card",
  "Delete a study card by its ID from a notebook page.",
  {
    notebook_id: z.string().describe("The ID of the notebook"),
    card_id: z.string().describe("The ID of the study card to delete"),
  },
  async ({ notebook_id, card_id }) => {
    await apiRequest(`/api/notebooks/${notebook_id}/cards/${card_id}`, {
      method: "DELETE",
    });
    return {
      content: [{ type: "text", text: `✅ Study card ${card_id} deleted.` }],
    };
  }
);

// ── Tool 7: annotate_page ─────────────────────────────────────────────
server.tool(
  "annotate_page",
  "Add a highlight, underline, or sticky note annotation to a PDF page in a notebook.",
  {
    notebook_id: z.string().describe("The ID of the notebook"),
    page_number: z.number().int().min(1).describe("Page number (1-based)"),
    type: z.enum(["highlight", "underline", "sticky"]).describe("Type of annotation"),
    x: z.number().describe("X position as fraction of canvas width (0-1)"),
    y: z.number().describe("Y position as fraction of canvas height (0-1)"),
    width: z.number().describe("Width as fraction of canvas width (0-1)"),
    height: z.number().describe("Height as fraction of canvas height (0-1)"),
    color: z.string().optional().default("#fde047").describe("Hex color for the annotation"),
    text: z.string().optional().default("").describe("Text label or sticky note content"),
  },
  async ({ notebook_id, page_number, type, x, y, width, height, color, text }) => {
    const { data } = await apiRequest(`/api/notebooks/${notebook_id}/annotations`, {
      method: "POST",
      body: JSON.stringify({ page_number, type, x, y, width, height, color, text }),
    });
    return {
      content: [
        {
          type: "text",
          text: `✅ Annotation added!\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }
);

// ── Tool 8: get_notebook_summary ─────────────────────────────────────
server.tool(
  "get_notebook_summary",
  "Trigger or retrieve an AI lecture summary for a notebook page. Returns key concepts, definitions, and follow-up study questions.",
  {
    notebook_id: z.string().describe("The ID of the notebook"),
    page_number: z.number().int().min(1).describe("Page number to summarize (1-based)"),
    regenerate: z.boolean().optional().default(false).describe("Force regeneration even if a summary already exists"),
  },
  async ({ notebook_id, page_number, regenerate }) => {
    // Check for existing summary first
    if (!regenerate) {
      try {
        const { data } = await apiRequest(`/api/notebooks/${notebook_id}/summarize?page=${page_number}`);
        const summaries = data as unknown[];
        if (Array.isArray(summaries) && summaries.length > 0) {
          return {
            content: [{ type: "text", text: JSON.stringify(summaries[0], null, 2) }],
          };
        }
      } catch {
        // Fall through to generation
      }
    }

    // Fetch OCR text from page
    const { data: fullData } = await apiRequest(`/api/notebooks/${notebook_id}?full=true`);
    const nb = fullData as { pages: Array<{ page_number: number; text_content: string }> };
    const page = nb.pages?.find((p) => p.page_number === page_number);
    const ocrText = page?.text_content || "";

    if (!ocrText) {
      return {
        content: [{ type: "text", text: "No text content found on this page. Run OCR first." }],
      };
    }

    const { data } = await apiRequest(`/api/notebooks/${notebook_id}/summarize`, {
      method: "POST",
      body: JSON.stringify({ page_number, ocr_text: ocrText }),
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool 9: list_lecture_summaries ───────────────────────────────────
server.tool(
  "list_lecture_summaries",
  "List all saved AI lecture summaries for a notebook, optionally filtered by page number.",
  {
    notebook_id: z.string().describe("The ID of the notebook"),
    page_number: z.number().int().min(1).optional().describe("Optional page filter"),
  },
  async ({ notebook_id, page_number }) => {
    const qs = page_number ? `?page=${page_number}` : "";
    const { data } = await apiRequest(`/api/notebooks/${notebook_id}/summarize${qs}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Start server ────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("Synapse Notes MCP Server v2.0 running on stdio\n");
