"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notebook, Page, AiCard, Stroke } from "@/lib/types";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import AnnotatedPDFCanvas from "./AnnotatedPDFCanvas";
import StudyCard from "./StudyCard";
import ThemeToggle from "./ThemeToggle";
import {
  getActiveCanvasSnapshot,
  exportCanvasToImage,
  exportToPDF,
  exportToWord,
  exportToPowerPoint,
  exportToExcel,
} from "@/lib/exportUtils";
import styles from "./NotebookEditor.module.css";

interface Props {
  notebook: Notebook;
  initialPages: Page[];
  initialCards: AiCard[];
  username: string;
}

export default function NotebookEditor({
  notebook: serverNotebook,
  initialPages,
  initialCards,
  username,
}: Props) {
  const router = useRouter();

  // Notebook metadata state
  const [notebook, setNotebook] = useState<Notebook>(serverNotebook);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(serverNotebook.title);

  // Tool state
  const [tool, setTool] = useState<"pen" | "highlighter" | "eraser" | "lasso">("pen");
  const [color, setColor] = useState("#1a1917");
  const [size, setSize] = useState(3);

  // Page state
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  // Export state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [showCards, setShowCards] = useState(false);
  const [showPDF, setShowPDF] = useState(
    !!initialPages.find(p => p.page_number === 1)?.pdf_url
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    initialPages.find(p => p.page_number === 1)?.pdf_url ?? null
  );
  const [cards, setCards] = useState<AiCard[]>(initialCards);

  // Auto-save debounce ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Client hydration from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`synapse_nb_${serverNotebook.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.title && (serverNotebook.title === "Untitled Notebook" || !serverNotebook.title)) {
          setNotebook(prev => ({ ...prev, title: parsed.title, subject: parsed.subject || prev.subject }));
          setTitleInput(parsed.title);
        }
        if (parsed.pages && parsed.pages.length > 0) {
          setPages(prev => {
            const map = new Map<number, Page>();
            for (const p of parsed.pages) map.set(p.page_number, p);
            for (const p of prev) {
              if (p.strokes_json !== "[]" || !map.has(p.page_number)) {
                map.set(p.page_number, p);
              }
            }
            return Array.from(map.values()).sort((a, b) => a.page_number - b.page_number);
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load local notebook cache:", e);
    }
  }, [serverNotebook.id, serverNotebook.title]);

  const currentPageData = pages.find(p => p.page_number === currentPage);
  const currentStrokes: Stroke[] = JSON.parse(currentPageData?.strokes_json || "[]");

  const persistLocally = useCallback(
    (updatedPages: Page[], currentTitle?: string) => {
      try {
        localStorage.setItem(
          `synapse_nb_${notebook.id}`,
          JSON.stringify({
            id: notebook.id,
            title: currentTitle || notebook.title,
            subject: notebook.subject,
            pages: updatedPages,
          })
        );
      } catch (e) {
        console.warn("Local storage save error:", e);
      }
    },
    [notebook.id, notebook.title, notebook.subject]
  );

  const handleStrokeSave = useCallback(
    (strokes: Stroke[]) => {
      setSaveStatus("saving");

      setPages(prev => {
        const idx = prev.findIndex(p => p.page_number === currentPage);
        let updated: Page[];
        if (idx >= 0) {
          updated = [...prev];
          updated[idx] = { ...updated[idx], strokes_json: JSON.stringify(strokes) };
        } else {
          updated = [
            ...prev,
            {
              id: `p-${currentPage}`,
              notebook_id: notebook.id,
              page_number: currentPage,
              strokes_json: JSON.stringify(strokes),
              text_content: "",
              pdf_url: pdfUrl,
              pdf_page: 1,
              updated_at: Math.floor(Date.now() / 1000),
            },
          ];
        }
        persistLocally(updated);
        return updated;
      });

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await fetch(`/api/notebooks/${notebook.id}/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_number: currentPage,
              strokes_json: JSON.stringify(strokes),
            }),
          });
        } catch (e) {
          console.warn("Server sync background warning:", e);
        }
        setSaveStatus("saved");
      }, 1000);
    },
    [notebook.id, currentPage, pdfUrl, persistLocally]
  );

  async function handleTitleSave() {
    setIsEditingTitle(false);
    const newTitle = titleInput.trim() || "Untitled Notebook";
    setNotebook(prev => ({ ...prev, title: newTitle }));
    persistLocally(pages, newTitle);

    try {
      await fetch(`/api/notebooks/${notebook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (e) {
      console.warn("Title sync warning:", e);
    }
  }

  async function uploadPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveStatus("saving");
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/pdf", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.data?.url) {
        const url = json.data.url;
        setPdfUrl(url);
        setShowPDF(true);
        await fetch(`/api/notebooks/${notebook.id}/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_number: currentPage, pdf_url: url }),
        });
      } else {
        alert(json.error || "Failed to upload PDF");
      }
    } catch (err) {
      console.error("PDF upload error:", err);
      alert("Network error while uploading PDF. Please try again.");
    }
    setSaveStatus("saved");
  }

  // ── Export Handlers ───────────────────────
  async function triggerExport(type: "pdf" | "png" | "docx" | "pptx" | "xlsx") {
    setShowExportMenu(false);
    setIsExporting(true);

    try {
      const snapshot = getActiveCanvasSnapshot();

      if (type === "png") {
        await exportCanvasToImage("png", notebook.title || "notebook");
      } else if (type === "pdf") {
        await exportToPDF(notebook, pages, snapshot);
      } else if (type === "docx") {
        await exportToWord(notebook, pages, cards, snapshot);
      } else if (type === "pptx") {
        await exportToPowerPoint(notebook, pages, cards, snapshot);
      } else if (type === "xlsx") {
        exportToExcel(notebook, pages, cards);
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

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
            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => e.key === "Enter" && handleTitleSave()}
                autoFocus
                style={{ fontSize: "var(--text-sm)", padding: "2px 6px", width: "180px" }}
              />
            ) : (
              <span
                className={styles.notebookTitle}
                onClick={() => setIsEditingTitle(true)}
                title="Click to rename"
                style={{ cursor: "pointer" }}
              >
                {notebook.title}
              </span>
            )}
            {notebook.subject && <span className={styles.notebookSubject}>{notebook.subject}</span>}
          </div>
          <span className={`${styles.saveBadge} ${saveStatus === "saving" ? styles.saving : ""}`}>
            {saveStatus === "saving" ? "Saving…" : "Saved ✓"}
          </span>
        </div>

        <div className={styles.topCenter}>
          <button
            className={`btn-icon ${!showPDF ? "active" : ""}`}
            onClick={() => setShowPDF(false)}
            title="Blank Canvas Mode"
            id="canvas-mode-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {pdfUrl && (
            <button
              className={`btn-icon ${showPDF ? "active" : ""}`}
              onClick={() => setShowPDF(true)}
              title="Annotate PDF Slides"
              id="pdf-mode-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18l4-4-4-4" />
              </svg>
            </button>
          )}

          <label className="btn-icon" title="Import PDF Slides" style={{ cursor: "pointer" }} id="import-pdf-btn">
            <input
              type="file"
              accept="application/pdf,application/x-pdf,.pdf"
              onChange={uploadPDF}
              style={{ display: "none" }}
              id="pdf-file-input"
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
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
          {/* Universal Multi-Format Export Dropdown */}
          <div ref={exportRef} className={styles.exportContainer}>
            <button
              className={styles.exportBtn}
              onClick={() => setShowExportMenu(m => !m)}
              disabled={isExporting}
              title="Export Notebook to PDF, Word, PowerPoint, Excel, or Image"
              id="export-dropdown-btn"
            >
              {isExporting ? (
                <span>Exporting…</span>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </>
              )}
            </button>

            {showExportMenu && (
              <div className={styles.exportMenu} id="export-menu-list">
                <button className={styles.exportItem} onClick={() => triggerExport("pdf")} id="export-pdf-opt">
                  <span className={styles.exportIcon}>📄</span>
                  <div className={styles.exportItemText}>
                    <span>PDF Document (.pdf)</span>
                    <span className={styles.exportItemSub}>Vector document & slide annotations</span>
                  </div>
                </button>

                <button className={styles.exportItem} onClick={() => triggerExport("png")} id="export-png-opt">
                  <span className={styles.exportIcon}>🖼️</span>
                  <div className={styles.exportItemText}>
                    <span>Image Snapshot (.png)</span>
                    <span className={styles.exportItemSub}>High-resolution canvas image</span>
                  </div>
                </button>

                <button className={styles.exportItem} onClick={() => triggerExport("docx")} id="export-docx-opt">
                  <span className={styles.exportIcon}>📝</span>
                  <div className={styles.exportItemText}>
                    <span>Word Document (.docx)</span>
                    <span className={styles.exportItemSub}>MS Word & Google Docs compatible</span>
                  </div>
                </button>

                <button className={styles.exportItem} onClick={() => triggerExport("pptx")} id="export-pptx-opt">
                  <span className={styles.exportIcon}>📊</span>
                  <div className={styles.exportItemText}>
                    <span>Presentation (.pptx)</span>
                    <span className={styles.exportItemSub}>PowerPoint & Google Slides deck</span>
                  </div>
                </button>

                <button className={styles.exportItem} onClick={() => triggerExport("xlsx")} id="export-xlsx-opt">
                  <span className={styles.exportIcon}>📈</span>
                  <div className={styles.exportItemText}>
                    <span>Spreadsheet (.xlsx)</span>
                    <span className={styles.exportItemSub}>Excel & Google Sheets study matrix</span>
                  </div>
                </button>
              </div>
            )}
          </div>

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

        {/* Canvas / Annotated PDF */}
        <main className={styles.canvasArea}>
          {showPDF && pdfUrl ? (
            <AnnotatedPDFCanvas
              url={pdfUrl}
              tool={tool}
              color={color}
              size={size}
              initialStrokes={currentStrokes}
              onStrokesChange={handleStrokeSave}
              onClose={() => setShowPDF(false)}
            />
          ) : (
            <Canvas
              notebookId={notebook.id}
              pageNumber={currentPage}
              tool={tool}
              color={color}
              size={size}
              onStrokesChange={handleStrokeSave}
              initialStrokes={currentStrokes}
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
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <p style={{ marginTop: 8, fontWeight: 500 }}>No AI cards yet</p>
                  <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                    Ask Claude Code or Codex to explain a concept from your notes!
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
