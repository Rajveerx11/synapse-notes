"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notebook, Page, AiCard, Stroke } from "@/lib/types";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import AnnotatedPDFCanvas from "./AnnotatedPDFCanvas";
import StudyCard from "./StudyCard";
import ThemeToggle from "./ThemeToggle";
import PDFExportModal from "./PDFExportModal";
import OcrPanel from "./OcrPanel";
import {
  getActiveCanvasSnapshot,
  exportCanvasToImage,
  exportToPDF,
  exportToWord,
  exportToPowerPoint,
  exportToExcel,
} from "@/lib/exportUtils";
import { quantizeStrokes } from "@/lib/compressionUtils";
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

  // Find any existing PDF URL across all initial pages
  const initialPdfUrl = initialPages.find(p => !!p.pdf_url)?.pdf_url ?? null;

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

  // Export state & modals
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Panel & PDF state with persistent restoration
  const [showCards, setShowCards] = useState(false);
  const [showOcr,   setShowOcr]   = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl);
  const [showPDF, setShowPDF] = useState<boolean>(!!initialPdfUrl);
  const [cards, setCards] = useState<AiCard[]>(initialCards);

  // OCR text callback — update the local page text_content
  const handleOcrSave = useCallback((text: string) => {
    setPages(prev => prev.map(p =>
      p.page_number === currentPage ? { ...p, text_content: text } : p
    ));
  }, [currentPage]);

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

  const persistLocally = useCallback(
    (
      updatedPages: Page[],
      currentTitle?: string,
      activePdfUrl?: string | null,
      activeShowPdf?: boolean
    ) => {
      try {
        const payload = {
          id: notebook.id,
          title: currentTitle || notebook.title,
          subject: notebook.subject,
          pages: updatedPages,
          pdfUrl: activePdfUrl !== undefined ? activePdfUrl : pdfUrl,
          showPDF: activeShowPdf !== undefined ? activeShowPdf : showPDF,
        };
        localStorage.setItem(`synapse_nb_${notebook.id}`, JSON.stringify(payload));
      } catch (e) {
        console.warn("Local storage save error:", e);
      }
    },
    [notebook.id, notebook.title, notebook.subject, pdfUrl, showPDF]
  );

  // Client hydration from localStorage on mount & hard refresh
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`synapse_nb_${serverNotebook.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.title && (serverNotebook.title === "Untitled Notebook" || !serverNotebook.title)) {
          setNotebook(prev => ({ ...prev, title: parsed.title, subject: parsed.subject || prev.subject }));
          setTitleInput(parsed.title);
        }

        // Restore PDF URL and view mode if cached
        const restoredPdfUrl = parsed.pdfUrl || initialPdfUrl;
        if (restoredPdfUrl) {
          setPdfUrl(restoredPdfUrl);
          if (parsed.showPDF !== undefined) {
            setShowPDF(parsed.showPDF);
          } else {
            setShowPDF(true);
          }
        }

        if (parsed.pages && parsed.pages.length > 0) {
          setPages(prev => {
            const map = new Map<number, Page>();
            for (const p of parsed.pages) map.set(p.page_number, p);
            for (const p of prev) {
              const existing = map.get(p.page_number);
              if (existing) {
                map.set(p.page_number, {
                  ...existing,
                  pdf_url: existing.pdf_url || p.pdf_url || restoredPdfUrl || null,
                });
              } else {
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
  }, [serverNotebook.id, serverNotebook.title, initialPdfUrl]);

  // Extract strokes specifically for current page
  const currentPageData = pages.find(p => p.page_number === currentPage);
  const currentStrokes: Stroke[] = currentPageData?.strokes_json
    ? JSON.parse(currentPageData.strokes_json)
    : [];

  // Save strokes scoped strictly to target pageNo
  const handleStrokeSave = useCallback(
    (pageNo: number, rawStrokes: Stroke[]) => {
      setSaveStatus("saving");
      const strokes = quantizeStrokes(rawStrokes);

      setPages(prev => {
        const idx = prev.findIndex(p => p.page_number === pageNo);
        let updated: Page[];
        if (idx >= 0) {
          updated = [...prev];
          updated[idx] = { ...updated[idx], strokes_json: JSON.stringify(strokes) };
        } else {
          updated = [
            ...prev,
            {
              id: `p-${pageNo}`,
              notebook_id: notebook.id,
              page_number: pageNo,
              strokes_json: JSON.stringify(strokes),
              text_content: "",
              pdf_url: pdfUrl,
              pdf_page: pageNo,
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
              page_number: pageNo,
              strokes_json: JSON.stringify(strokes),
              pdf_url: pdfUrl,
            }),
          });
        } catch (e) {
          console.warn("Server sync background warning:", e);
        }
        setSaveStatus("saved");
      }, 1000);
    },
    [notebook.id, pdfUrl, persistLocally]
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

        // Update pages in state and local storage immediately
        const updated = pages.map(p => ({ ...p, pdf_url: url }));
        setPages(updated);
        persistLocally(updated, notebook.title, url, true);

        // Sync to cloud database
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

  function handleTogglePdf(show: boolean) {
    setShowPDF(show);
    persistLocally(pages, notebook.title, pdfUrl, show);
  }

  // ── Universal Export Trigger ───────────────────
  async function triggerExport(type: "pdf" | "png" | "docx" | "pptx" | "xlsx") {
    setShowExportMenu(false);

    if (type === "pdf") {
      setShowPdfModal(true);
      return;
    }

    setIsExporting(true);
    try {
      const snapshot = getActiveCanvasSnapshot();

      if (type === "png") {
        await exportCanvasToImage("png", notebook.title || "notebook");
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

  // ── Handle Modal PDF Export ───────────────────
  async function handleModalPdfExport(options: { filename: string; mode: "replace" | "copy" }) {
    setIsExporting(true);
    try {
      if (pdfUrl) {
        const mainCanvas = document.querySelector("canvas");
        const res = await fetch("/api/pdf/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl,
            strokes: currentStrokes,
            canvasWidth: mainCanvas?.clientWidth || 800,
            canvasHeight: mainCanvas?.clientHeight || 600,
            replaceOriginal: options.mode === "replace",
            notebookId: notebook.id,
            pageNumber: currentPage,
            customFilename: options.filename,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || "PDF export failed");
        }

        const json = await res.json();
        const downloadUrl = json.data?.url;

        if (options.mode === "replace") {
          setPdfUrl(downloadUrl);
          persistLocally(pages, notebook.title, downloadUrl, true);
          alert("✅ Notebook slide deck successfully updated with your vector annotations!");
        } else {
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = json.data?.filename || `${options.filename}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        // Blank notebook export to PDF
        const snapshot = getActiveCanvasSnapshot();
        await exportToPDF(notebook, pages, snapshot);
      }

      setShowPdfModal(false);
    } catch (err) {
      console.error("PDF export error:", err);
      alert(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={styles.layout}>
      {/* PDF Export Options Modal */}
      <PDFExportModal
        isOpen={showPdfModal}
        defaultTitle={notebook.title || "Notebook"}
        onClose={() => setShowPdfModal(false)}
        onExport={handleModalPdfExport}
        isExporting={isExporting}
        hasOriginalPdf={!!pdfUrl}
      />

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
            {saveStatus === "saving" ? "Saving…" : "Synced ✓"}
          </span>
        </div>

        <div className={styles.topCenter}>
          <button
            className={`btn-icon ${!showPDF ? "active" : ""}`}
            onClick={() => handleTogglePdf(false)}
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
              onClick={() => handleTogglePdf(true)}
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
                    <span className={styles.exportItemSub}>Replace original or save copy</span>
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
          onOcrClick={() => { setShowOcr(v => !v); setShowCards(false); }}
          showOcr={showOcr}
        />

        {/* Canvas / Annotated PDF */}
        <main className={styles.canvasArea}>
          {showPDF && pdfUrl ? (
            <AnnotatedPDFCanvas
              key={`pdf-page-${currentPage}`}
              url={pdfUrl}
              notebookId={notebook.id}
              notebookTitle={notebook.title}
              tool={tool}
              color={color}
              size={size}
              pageNumber={currentPage}
              onPageChange={setCurrentPage}
              initialStrokes={currentStrokes}
              onStrokesChange={handleStrokeSave}
              onPdfUrlChange={url => {
                setPdfUrl(url);
                persistLocally(pages, notebook.title, url, true);
              }}
              onClose={() => handleTogglePdf(false)}
            />
          ) : (
            <Canvas
              key={`canvas-page-${currentPage}`}
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

        {/* Right — OCR Panel */}
        {showOcr && (
          <OcrPanel
            notebookId={notebook.id}
            pageNumber={currentPage}
            onSaveText={handleOcrSave}
            onClose={() => setShowOcr(false)}
          />
        )}
      </div>
    </div>
  );
}
