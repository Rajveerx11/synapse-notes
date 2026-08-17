# Model Context Protocol (MCP) Specification

This document details the MCP server interface for **Synapse Notes**, allowing AI agents like **Claude Code**, **Codex**, and **Antigravity** to interact with the student's notebook.

---

## 1. Available Tools

### `list_notebooks`
- **Description**: Returns all subjects, folders, and notebooks in the student's library.
- **Parameters**: None
- **Returns**: Array of notebooks `{ id, title, subject, pageCount, updatedAt }`

---

### `get_page_content`
- **Description**: Retrieves full context of a specific notebook page, including transcribed handwriting, slide text, and attached AI cards.
- **Parameters**:
  - `notebookId` (string, required): The ID of the notebook.
  - `pageNumber` (number, required): The page index (1-based).
- **Returns**: Page context object `{ pageNumber, slideText, handwrittenText, mathFormulas, aiCards, pdfUrl }`

---

### `search_notes`
- **Description**: Performs keyword or semantic search across all lecture slides, handwriting transcripts, and AI cards.
- **Parameters**:
  - `query` (string, required): The search phrase or math concept (e.g. "Cross-Entropy Loss", "Transformer Attention").
- **Returns**: Array of search matches with snippet, page number, and notebook title.

---

### `insert_ai_study_card`
- **Description**: Inserts a new study card, explanation, or diagram directly onto a student's notebook page.
- **Parameters**:
  - `notebookId` (string, required): Target notebook ID.
  - `pageNumber` (number, required): Target page number.
  - `title` (string, required): Card headline (e.g. "How Backpropagation Works").
  - `content` (string, required): Markdown formatted explanation (supports LaTeX math `$..$` and `$$..$$`).
  - `diagramType` (string, optional): `"mermaid"` | `"flowchart"` | `"none"`
  - `diagramData` (string, optional): Mermaid or diagram source code.
- **Returns**: `{ success: boolean, cardId: string }`
