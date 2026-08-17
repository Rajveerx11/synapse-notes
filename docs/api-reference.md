# REST API Reference — Synapse Notes

Complete technical reference for the **Synapse Notes** REST API.

---

## 🔐 Authentication

Protected routes require one of two authentication methods:

1. **Session Cookie:** Sent automatically by browsers via the `synapse_token` cookie.
2. **Bearer Token (MCP / API):** Pass your API key in the HTTP `Authorization` header:
   ```http
   Authorization: Bearer synapse_sec_89f2a93c71e28b14a
   ```

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Create a new student account.

#### Request Body
```json
{
  "username": "rajveer",
  "password": "strongPassword123"
}
```

#### Response (`200 OK`)
```json
{
  "ok": true
}
```

---

### `POST /api/auth/login`
Authenticate an existing student.

#### Request Body
```json
{
  "username": "rajveer",
  "password": "strongPassword123"
}
```

#### Response (`200 OK`)
Sets `Set-Cookie: synapse_token=...; HttpOnly; Path=/; SameSite=Lax`.
```json
{
  "ok": true
}
```

---

### `POST /api/auth/logout`
Terminates the session and clears the auth cookie.

---

## 2. Notebook Management

### `GET /api/notebooks`
Returns all notebooks owned by the authenticated student.

#### Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
      "user_id": "usr_991823",
      "title": "Machine Learning — Lecture 4",
      "subject": "Deep Learning",
      "created_at": 1723891200,
      "updated_at": 1723894800,
      "page_count": 3
    }
  ]
}
```

---

### `POST /api/notebooks`
Creates a new notebook.

#### Request Body
```json
{
  "title": "Optimization Methods",
  "subject": "Mathematics for ML"
}
```

#### Response (`201 Created`)
```json
{
  "data": {
    "id": "b1e9c201-44bb-4781-81f1-a1892c9ff002",
    "user_id": "usr_991823",
    "title": "Optimization Methods",
    "subject": "Mathematics for ML",
    "created_at": 1723895000,
    "updated_at": 1723895000,
    "page_count": 1
  }
}
```

---

### `GET /api/notebooks/:id`
Retrieves notebook details and all associated pages.

#### Parameters
* `id` *(string, path)*: The notebook UUID.

#### Response (`200 OK`)
```json
{
  "data": {
    "notebook": {
      "id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
      "title": "Machine Learning — Lecture 4",
      "subject": "Deep Learning",
      "updated_at": 1723894800
    },
    "pages": [
      {
        "id": "p_001",
        "notebook_id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
        "page_number": 1,
        "strokes_json": "[{\"id\":\"s1\",\"tool\":\"pen\",\"color\":\"#1a1917\",\"size\":3,\"opacity\":1,\"points\":[{\"x\":120,\"y\":80,\"pressure\":0.6}]}]",
        "text_content": "Loss functions: Cross Entropy vs MSE",
        "pdf_url": "/api/pdf/pdf_99281a",
        "pdf_page": 1,
        "updated_at": 1723894800
      }
    ]
  }
}
```

---

### `PATCH /api/notebooks/:id`
Update notebook metadata (title, subject).

#### Request Body
```json
{
  "title": "Advanced Optimization Methods"
}
```

---

### `DELETE /api/notebooks/:id`
Deletes a notebook and cascades deletion across all pages and attached AI cards.

---

## 3. Page & Stroke Operations

### `POST /api/notebooks/:id/pages`
Upsert strokes, transcription text, or slide attachments on a specific page.

#### Request Body
```json
{
  "page_number": 1,
  "strokes_json": "[{\"id\":\"str_1\",\"tool\":\"pen\",\"color\":\"#2d6ef6\",\"size\":4,\"opacity\":1,\"points\":[{\"x\":50,\"y\":100,\"pressure\":0.7}]}]",
  "text_content": "Backpropagation gradient flow calculation",
  "pdf_url": "/api/pdf/pdf_881923"
}
```

#### Response (`200 OK`)
```json
{
  "data": {
    "id": "p_001"
  }
}
```

---

## 4. AI Study Cards

### `GET /api/notebooks/:id/cards`
Fetch AI study cards attached to a notebook or specific page.

#### Query Parameters
* `page` *(optional, int)*: Filter by page index (e.g. `?page=1`).

#### Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "card_01",
      "page_id": "p_001",
      "notebook_id": "71b7e13e-a898-4221-998f-3fdeeeda24ef",
      "title": "Cross-Entropy Loss Derivation",
      "content": "For binary classification:\n$$\\mathcal{L}(y, \\hat{y}) = - [y \\log \\hat{y} + (1-y) \\log(1-\\hat{y})]$$",
      "diagram_type": "mermaid",
      "diagram_data": "graph LR\n  X[Inputs] --> H[Hidden Layer]\n  H --> O[Softmax Output]\n  O --> L[Cross-Entropy Loss]",
      "created_at": 1723894900
    }
  ]
}
```

---

### `POST /api/notebooks/:id/cards`
Used by AI Agents (MCP) to insert a study card.

#### Request Body
```json
{
  "page_number": 1,
  "title": "Attention Mechanism Breakdown",
  "content": "Calculated via Scaled Dot-Product Attention:\n$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$",
  "diagram_type": "mermaid",
  "diagram_data": "graph TD\n  Q[Queries] --> MatMul[MatMul]\n  K[Keys] --> MatMul\n  MatMul --> Scale[Scale / Sqrt(d_k)]\n  Scale --> Softmax[Softmax]\n  Softmax --> VMat[MatMul with Values]\n  V[Values] --> VMat"
}
```

---

## 5. PDF Slide Operations

### `POST /api/pdf`
Upload a lecture slide PDF (`multipart/form-data`).

#### Response (`201 Created`)
```json
{
  "data": {
    "url": "/api/pdf/3a89e1b2-c011-47a3-8991-889123feaa19"
  }
}
```

---

### `GET /api/pdf/:id`
Streams the binary PDF document directly to the client with `Content-Type: application/pdf`.

---

### `POST /api/pdf/export`
Bakes canvas vector handwriting into the PDF document and exports a downloadable file.

#### Request Body
```json
{
  "pdfUrl": "/api/pdf/3a89e1b2-c011-47a3-8991-889123feaa19",
  "strokes": [ ... ],
  "canvasWidth": 1200,
  "canvasHeight": 800
}
```

#### Response (`200 OK`)
```json
{
  "data": {
    "url": "/api/pdf/annotated-991823-1723895000.pdf"
  }
}
```

---

## 6. Global Search

### `GET /api/search?q=backpropagation`
Searches across all handwritten notes, transcribed text, and AI study cards.

#### Response (`200 OK`)
```json
{
  "data": {
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
}
```
