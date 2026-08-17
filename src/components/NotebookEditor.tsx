"use client";
import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Notebook, Page, AiCard, Stroke } from "@/lib/types";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import PDFViewer from "./PDFViewer";
import StudyCard from "./StudyCard";
import ThemeToggle from "./ThemeToggle";
import styles from "./NotebookEditor.module.css";

interface Props {
  notebook: Notebook;
  initialPages: Page[];
  initialCards: AiCard[];
  username: string;
}

export default function NotebookEditor({ notebook, initialPages, initialCards, username }: Props) {
  const router = useRouter();

  // Tool state
  const [tool, setTool] = useState<"pen" | "highlighter" | "eraser" | "lasso">("pen");
  const [color, setColor] = useState("#1a1917");
  const [size, setSize] = useState(3);

  // Page state
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(initialPages.length, currentPage);

  // Panel state
  const [showCards, setShowCards] = useState(false);
  const [showPDF, setShowPDF] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    initialPages.find(p => p.page_number === 1)?.pdf_url ?? null
  );
  const [cards, setCards] = useState<AiCard[]>(initialCards);

  // Auto-save debounce ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStrokeSave = useCallback(
    (strokes: Stroke[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/notebooks/${notebook.id}/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page_number: currentPage,
            strokes_json: JSON.stringify(strokes),
          }),
        });
      }, 1500);
    },
    [notebook.id, currentPage]
  );

  async function uploadPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/pdf", { method: "POST", body: form });
    const json = await res.json();
    if (res.ok) {
      const url = json.data.url;
      setPdfUrl(url);
      setShowPDF(true);
      await fetch(`/api/notebooks/${notebook.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_number: currentPage, pdf_url: url }),
      });
    }
  }

  const pageCards = cards.filter(c => {
    const page = initialPages.find(p => p.notebook_id === notebook.id);
    return true; // Show all cards in sidebar for v1
  });

  return (
    <div className={styles.layout}>
      {/* Top Bar */}
      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <button className="btn-icon" onClick={() => router.push("/")} title="Back to notebooks" id="back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={styles.notebookMeta}>
            <span className={styles.notebookTitle}>{notebook.title}</span>
            {notebook.subject && <span className={styles.notebookSubject}>{notebook.subject}</span>}
          </div>
        </div>

        <div className={styles.topCenter}>
          <button
            className={`btn-icon ${!showPDF ? "active" : ""}`}
            onClick={() => setShowPDF(false)}
            title="Canvas only"
            id="canvas-mode-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9l2 2 4-4M9 15l2 2 4-4" opacity="0" />
            </svg>
          </button>
          <label className="btn-icon" title="Import PDF" style={{ cursor: "pointer" }} id="import-pdf-btn">
            <input type="file" accept="application/pdf" onChange={uploadPDF} style={{ display: "none" }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </label>
          <div className={styles.pageIndicator}>
            <button
              className="btn-icon"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              id="prev-page-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className={styles.pageNum}>Page {currentPage}</span>
            <button
              className="btn-icon"
              onClick={() => setCurrentPage(p => p + 1)}
              id="next-page-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <div className={styles.topRight}>
          <button
            className={`btn-icon ${showCards ? "active" : ""}`}
            onClick={() => setShowCards(s => !s)}
            title="AI Study Cards"
            id="cards-toggle-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
            {cards.length > 0 && <span className={styles.cardBadge}>{cards.length}</span>}
          </button>
          <ThemeToggle />
          <span className={styles.username}>{username}</span>
        </div>
      </header>

      {/* Body */}
      <div className={styles.body}>
        {/* Left Toolbar */}
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          size={size}
          onSizeChange={setSize}
        />

        {/* Canvas + PDF */}
        <main className={styles.canvasArea}>
          {showPDF && pdfUrl ? (
            <PDFViewer
              url={pdfUrl}
              onClose={() => setShowPDF(false)}
              onAnnotate={() => {}}
            />
          ) : (
            <Canvas
              notebookId={notebook.id}
              pageNumber={currentPage}
              tool={tool}
              color={color}
              size={size}
              onStrokesChange={handleStrokeSave}
              initialStrokes={
                JSON.parse(
                  initialPages.find(p => p.page_number === currentPage)?.strokes_json ?? "[]"
                ) as Stroke[]
              }
            />
          )}
        </main>

        {/* Right — AI Cards Panel */}
        {showCards && (
          <aside className={styles.cardsPanel}>
            <div className={styles.cardsPanelHeader}>
              <h3>AI Study Cards</h3>
              <button className="btn-icon" onClick={() => setShowCards(false)} id="close-cards-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className={styles.cardsList}>
              {cards.length === 0 ? (
                <div className={styles.emptyCards}>
                  <p>No AI cards yet.</p>
                  <p className="text-xs text-muted" style={{ marginTop: 8 }}>
                    Ask your AI agent (Claude Code / Codex) to explain a topic from your notes!
                  </p>
                </div>
              ) : (
                cards.map(card => <StudyCard key={card.id} card={card} />)
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
