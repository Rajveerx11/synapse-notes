export interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: number;
}

export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  created_at: number;
  updated_at: number;
  page_count?: number;
}

export interface Page {
  id: string;
  notebook_id: string;
  page_number: number;
  strokes_json: string;
  text_content: string;
  pdf_url: string | null;
  pdf_page: number | null;
  updated_at: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  opacity: number;
  points: { x: number; y: number; pressure: number }[];
}

export interface AiCard {
  id: string;
  page_id: string;
  notebook_id: string;
  title: string;
  content: string;
  diagram_type: "none" | "mermaid" | "flowchart";
  diagram_data: string;
  created_at: number;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}
