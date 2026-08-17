# Model Context Protocol (MCP) Interface Specification

**Protocol Version:** `2024-11-05` (Standard Model Context Protocol)  
**Server Name:** `synapse-notes`  
**Version:** `1.0.0`  
**Transport:** Standard Input/Output (`stdio`)  

---

## 1. Specification Overview

The Synapse Notes MCP Server acts as an open, standardized bridge between your student notebook repository and external AI reasoning agents (e.g. **Claude Code**, **OpenAI Codex**, **Antigravity**).

Through this interface, AI agents can:
1. **Discover** notebooks and subjects.
2. **Inspect** handwritten notes, lecture slides, and math equations.
3. **Search** across lecture content semantically.
4. **Append** structured study cards with LaTeX equations and Mermaid diagrams directly into notebook pages.

---

## 2. Tool Definitions & JSON Schemas

### 1. `list_notebooks`
Lists all subjects, folders, and notebooks in the student's library with metadata and page counts.

#### Schema
```json
{
  "name": "list_notebooks",
  "description": "List all notebooks in Synapse Notes. Returns notebook IDs, titles, subjects, and page counts.",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
```

#### Example Output
```json
[
  {
    "id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
    "title": "Machine Learning — Lecture 4",
    "subject": "Deep Learning",
    "page_count": 5,
    "updated_at": 1723894800
  },
  {
    "id": "a98812c3-1120-4100-b88a-98123efca001",
    "title": "Convex Optimization",
    "subject": "Mathematics for ML",
    "page_count": 2,
    "updated_at": 1723891000
  }
]
```

---

### 2. `get_page_content`
Retrieves the comprehensive context of a specific notebook page including transcribed handwriting, slide text, and attached AI cards.

#### Schema
```json
{
  "name": "get_page_content",
  "description": "Get the full content of a specific notebook page including handwritten text, slide PDF info, and any AI study cards on that page.",
  "parameters": {
    "type": "object",
    "properties": {
      "notebook_id": {
        "type": "string",
        "description": "The unique UUID of the notebook."
      },
      "page_number": {
        "type": "integer",
        "minimum": 1,
        "description": "The page index (1-based)."
      }
    },
    "required": ["notebook_id", "page_number"]
  }
}
```

#### Example Output
```json
{
  "notebook_title": "Machine Learning — Lecture 4",
  "subject": "Deep Learning",
  "page_number": 2,
  "text_content": "Gradient descent step with backpropagation. Loss = CrossEntropy(y, y_hat).",
  "has_pdf": true,
  "pdf_page": 2,
  "stroke_count": 48,
  "ai_cards": [
    {
      "id": "card_01",
      "title": "Chain Rule in Backprop",
      "content": "Using the multi-variable chain rule:\n$$\\frac{\\partial L}{\\partial W^{(l)}} = \\delta^{(l)} (a^{(l-1)})^T$$",
      "diagram_type": "mermaid",
      "diagram_data": "graph LR\n  A[Layer l-1] --> B[Layer l]\n  B --> C[Loss L]"
    }
  ]
}
```

---

### 3. `search_notes`
Performs a search query across all lecture slides, handwritten transcriptions, and AI study cards.

#### Schema
```json
{
  "name": "search_notes",
  "description": "Search across all handwritten notes, lecture slides, and AI study cards in Synapse Notes.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query — topic, keyword, or concept (e.g. 'backpropagation', 'attention mechanism')"
      }
    },
    "required": ["query"]
  }
}
```

#### Example Output
```json
{
  "pages": [
    {
      "notebook_id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
      "page_number": 2,
      "text_content": "Gradient descent step with backpropagation",
      "notebook_title": "Machine Learning — Lecture 4",
      "subject": "Deep Learning"
    }
  ],
  "cards": [
    {
      "title": "How Backpropagation Works",
      "content": "Chain rule formulation...",
      "notebook_id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
      "page_number": 2,
      "notebook_title": "Machine Learning — Lecture 4"
    }
  ]
}
```

---

### 4. `insert_ai_study_card`
Appends an AI-generated study card directly to a student's notebook page with formatting for LaTeX math and Mermaid diagrams.

#### Schema
```json
{
  "name": "insert_ai_study_card",
  "description": "Insert an AI-generated study card directly onto a notebook page. The card supports markdown, LaTeX math ($ and $$), and Mermaid diagrams.",
  "parameters": {
    "type": "object",
    "properties": {
      "notebook_id": {
        "type": "string",
        "description": "The unique UUID of the target notebook."
      },
      "page_number": {
        "type": "integer",
        "minimum": 1,
        "description": "The target page number (1-based)."
      },
      "title": {
        "type": "string",
        "description": "Card headline (e.g. 'Transformer Multi-Head Attention Explained')."
      },
      "content": {
        "type": "string",
        "description": "Card body in Markdown with inline $...$ or block $$...$$ LaTeX math equations."
      },
      "diagram_type": {
        "type": "string",
        "enum": ["none", "mermaid", "flowchart"],
        "default": "none",
        "description": "Type of diagram to render."
      },
      "diagram_data": {
        "type": "string",
        "default": "",
        "description": "Mermaid diagram definition string."
      }
    },
    "required": ["notebook_id", "page_number", "title", "content"]
  }
}
```

#### Example Output
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Study card inserted successfully!\n{\n  \"id\": \"c891-992a-4812\",\n  \"notebook_id\": \"71b7e13e-a898-4221-998f-3fdeeeda24ef\",\n  \"page_number\": 2,\n  \"title\": \"Transformer Multi-Head Attention Explained\"\n}"
    }
  ]
}
```
