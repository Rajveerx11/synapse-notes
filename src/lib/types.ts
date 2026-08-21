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
  tags?: Tag[];
  folder_id?: string | null;
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
  code_content?: string;
  code_language?: string;
  code_line_height?: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  opacity: number;
  points: { x: number; y: number; pressure: number }[];
  anchor_line?: number;
  line_offset_y?: number;
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
  interval_days?: number;
  ease_factor?: number;
  repetitions?: number;
  next_review_at?: number;
}

export interface PdfAnnotation {
  id: string;
  notebook_id: string;
  page_number: number;
  type: "highlight" | "underline" | "sticky";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  created_at: number;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

export interface LectureSummary {
  id: string;
  notebook_id: string;
  page_number: number;
  title: string;
  key_concepts: string[];
  definitions: Record<string, string>;
  follow_up_questions: string[];
  raw_text: string;
  model_used: string;
  created_at: number;
}

export interface KnowledgeGraphReference {
  source_notebook_id: string;
  source_notebook_title: string;
  target_id: string;
  target_title: string;
  source_type: "page" | "card";
  source_label: string;
  page_number: number;
}

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  kind: "notebook" | "concept";
  subject: string;
  href?: string;
  incoming_count: number;
  outgoing_count: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  mentions: number;
  references: KnowledgeGraphReference[];
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  subjects: string[];
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}
