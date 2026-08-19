"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notebook, Page, AiCard, Stroke } from "@/lib/types";
import Canvas from "./Canvas";
import InfiniteCanvas from "./InfiniteCanvas";
import AnnotatedCodeCanvas from "./AnnotatedCodeCanvas";
import { SupportedLanguage } from "@/lib/codeHighlighter";
import Toolbar from "./Toolbar";
import AnnotatedPDFCanvas from "./AnnotatedPDFCanvas";
import StudyCard from "./StudyCard";
import ThemeToggle from "./ThemeToggle";
import PDFExportModal from "./PDFExportModal";
import OcrPanel from "./OcrPanel";
import FlashcardReviewModal from "./FlashcardReviewModal";
import LectureSummaryPanel from "./LectureSummaryPanel";
import LiveCollaborators from "./LiveCollaborators";
import { CollaboratorPeer, LiveBroadcastMessage } from "@/lib/collaboration";
import { v4 as uuid } from "uuid";
import {
  getActiveCanvasSnapshot,
  exportCanvasToImage,
  exportToPDF,
  exportToWord,
  exportToPowerPoint,
  exportToExcel,
} from "@/lib/exportUtils";
import { quantizeStrokes } from "@/lib/compressionUtils";
import { queueStrokeUpdate } from "@/lib/offlineQueue";
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
  const [showSummary, setShowSummary] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [showCodeMode, setShowCodeMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl);
  const [showPDF, setShowPDF] = useState<boolean>(!!initialPdfUrl);
  const [cards, setCards] = useState<AiCard[]>(initialCards);
  const [isOnline, setIsOnline] = useState(true);
  const [activePeers, setActivePeers] = useState<CollaboratorPeer[]>([]);

  // Unique client session ID for peer tracking
  const clientIdRef = useRef<string>("");
  useEffect(() => {
    if (!clientIdRef.current) {
      clientIdRef.current = `client_${uuid().slice(0, 8)}`;
    }
  }, []);

  // Last timestamp for live event sync
  const lastSyncRef = useRef<number>(Date.now());

  // Real-time peer sync and stroke delta listening loop
  useEffect(() => {
    if (typeof window === "undefined" || !isOnline) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const cId = clientIdRef.current;
        if (!cId) return;

        const res = await fetch(
          `/api/notebooks/${notebook.id}/live?since=${lastSyncRef.current}&clientId=${cId}`
        );
        if (!res.ok || !isMounted) return;

        const json = await res.json();
        if (json.data) {
          const { events, activePeers: peers, timestamp } = json.data as {
            events: LiveBroadcastMessage[];
            activePeers: CollaboratorPeer[];
            timestamp: number;
          };

          lastSyncRef.current = timestamp;
          setActivePeers(peers || []);

          // Apply remote stroke events to pages
          if (events && events.length > 0) {
            for (const ev of events) {
              if (ev.clientId === cId) continue; // Skip own broadcast

              if (ev.type === "stroke_added" && ev.payload?.stroke && ev.payload?.pageNumber) {
                const targetPage = ev.payload.pageNumber;
                const newStroke = ev.payload.stroke;

                setPages(prev => {
                  return prev.map(p => {
                    if (p.page_number !== targetPage) return p;
                    const existingStrokes: Stroke[] = p.strokes_json ? JSON.parse(p.strokes_json) : [];
                    if (existingStrokes.some(s => s.id === newStroke.id)) return p; // Already merged
                    return {
                      ...p,
                      strokes_json: JSON.stringify([...existingStrokes, newStroke]),
                    };
                  });
                });
              }
            }
          }
        }
      } catch (e) {
        // Silently retry on next tick
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
      // Graceful leave broadcast
      if (clientIdRef.current) {
        fetch(`/api/notebooks/${notebook.id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave", clientId: clientIdRef.current }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [notebook.id, isOnline]);

  // Track online/offline status
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

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

      // Broadcast latest stroke to real-time room
      if (rawStrokes.length > 0 && clientIdRef.current && typeof window !== "undefined" && navigator.onLine) {
        const latestStroke = rawStrokes[rawStrokes.length - 1];
        fetch(`/api/notebooks/${notebook.id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "stroke",
            clientId: clientIdRef.current,
            pageNumber: pageNo,
            stroke: latestStroke,
          }),
        }).catch(() => {});
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          queueStrokeUpdate({
            notebookId: notebook.id,
            pageNumber: pageNo,
            strokesJson: JSON.stringify(strokes),
            pdfUrl: pdfUrl,
          });
          setSaveStatus("saved");
          return;
        }

        try {
          const res = await fetch(`/api/notebooks/${notebook.id}/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_number: pageNo,
              strokes_json: JSON.stringify(strokes),
              pdf_url: pdfUrl,
            }),
          });
          if (!res.ok) {
            queueStrokeUpdate({
              notebookId: notebook.id,
              pageNumber: pageNo,
              strokesJson: JSON.stringify(strokes),
              pdfUrl: pdfUrl,
            });
          }
        } catch (e) {
          console.warn("Server sync background warning, queued offline:", e);
          queueStrokeUpdate({
            notebookId: notebook.id,
            pageNumber: pageNo,
            strokesJson: JSON.stringify(strokes),
            pdfUrl: pdfUrl,
          });
        }
        setSaveStatus("saved");
      }, 1000);
    },
    [notebook.id, pdfUrl, persistLocally]
  );

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.page_number === currentPage);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], code_content: newCode };
        persistLocally(updated);
        return updated;
      });

      // Debounced save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await fetch(`/api/notebooks/${notebook.id}/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_number: currentPage,
              code_content: newCode,
            }),
          });
        } catch (e) {
          console.warn("Failed to sync code content:", e);
        }
      }, 1000);
    },
    [currentPage, notebook.id, persistLocally]
  );

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.page_number === currentPage);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], code_language: lang };
        persistLocally(updated);
        return updated;
      });

      fetch(`/api/notebooks/${notebook.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_number: currentPage,
          code_language: lang,
        }),
      }).catch(() => {});
    },
    [currentPage, notebook.id, persistLocally]
  );

  const handleLineHeightChange = useCallback(
    (ratio: number) => {
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.page_number === currentPage);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], code_line_height: ratio };
        persistLocally(updated);
        return updated;
      });

      fetch(`/api/notebooks/${notebook.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_number: currentPage,
          code_line_height: ratio,
        }),
      }).catch(() => {});
    },
    [currentPage, notebook.id, persistLocally]
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
          <span
            className={`${styles.saveBadge} ${
              !isOnline ? styles.saving : saveStatus === "saving" ? styles.saving : ""
            }`}
          >
            {!isOnline
              ? "Offline (Local ✓)"
              : saveStatus === "saving"
              ? "Saving…"
              : "Synced ✓"}
          </span>
        </div>

        <div className={styles.topCenter}>
          <button
            className={`btn-icon ${!showPDF && !showCodeMode ? "active" : ""}`}
            onClick={() => { setShowPDF(false); setShowCodeMode(false); }}
            title="Blank Canvas Mode"
            id="canvas-mode-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <button
            className={`btn-icon ${showCodeMode ? "active" : ""}`}
            onClick={() => { setShowCodeMode(v => !v); setShowPDF(false); }}
            title="Code Note-Taking Mode (Typed Snippets + Line-Anchored Ink Notes)"
            id="code-mode-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>

          {pdfUrl && (
            <button
              className={`btn-icon ${showPDF ? "active" : ""}`}
              onClick={() => { handleTogglePdf(true); setShowCodeMode(false); }}
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

          {/* Infinite scroll mode toggle */}
          {!showPDF && (
            <button
              className={`btn-icon ${infiniteMode ? "active" : ""}`}
              onClick={() => setInfiniteMode(m => !m)}
              title={infiniteMode ? "Single-page mode" : "Infinite scroll mode"}
              id="infinite-mode-btn"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="5" rx="1" />
                <rect x="3" y="10" width="18" height="5" rx="1" opacity="0.5" />
                <rect x="3" y="17" width="18" height="5" rx="1" opacity="0.25" />
              </svg>
            </button>
          )}
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
          <button
            className={`btn-icon ${showSummary ? "active" : ""}`}
            onClick={() => { setShowSummary(s => !s); setShowOcr(false); setShowCards(false); }}
            title="AI Lecture Summary"
            id="summary-toggle-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <LiveCollaborators peers={activePeers} currentClientId={clientIdRef.current} />
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

        {/* Canvas / Annotated PDF / Code Canvas */}
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
          ) : showCodeMode ? (
            <AnnotatedCodeCanvas
              key={`code-page-${currentPage}`}
              notebookId={notebook.id}
              pageNumber={currentPage}
              code={currentPageData?.code_content || "# Type or paste your code snippet here\ndef main():\n    print('Hello Synapse Notes!')\n"}
              language={(currentPageData?.code_language as SupportedLanguage) || "python"}
              lineHeightRatio={currentPageData?.code_line_height || 2.4}
              tool={tool}
              color={color}
              size={size}
              initialStrokes={currentStrokes}
              onCodeChange={handleCodeChange}
              onLanguageChange={handleLanguageChange}
              onLineHeightChange={handleLineHeightChange}
              onStrokesChange={handleStrokeSave}
            />
          ) : infiniteMode ? (
            <InfiniteCanvas
              notebookId={notebook.id}
              pages={pages.length > 0 ? pages : [{
                id: "p-1",
                notebook_id: notebook.id,
                page_number: 1,
                strokes_json: "[]",
                text_content: "",
                pdf_url: null,
                pdf_page: null,
                updated_at: Math.floor(Date.now() / 1000),
              }]}
              currentPage={currentPage}
              tool={tool}
              color={color}
              size={size}
              onStrokesChange={handleStrokeSave}
              onPageChange={setCurrentPage}
              onAddPage={() => setCurrentPage(p => p + 1)}
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
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {cards.length > 0 && (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                    onClick={() => setShowReviewModal(true)}
                    id="study-panel-btn"
                    title="Start active recall review session"
                  >
                    Study (SRS)
                  </button>
                )}
                <button className="btn-icon" onClick={() => setShowCards(false)} id="close-cards-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
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

        {/* Right — AI Lecture Summary Panel */}
        {showSummary && (
          <LectureSummaryPanel
            notebookId={notebook.id}
            pageNumber={currentPage}
            ocrText={currentPageData?.text_content || currentPageData?.code_content || ""}
            onSaveCard={async (title: string, content: string) => {
              try {
                const pageId = currentPageData?.id || `p-${currentPage}`;
                const res = await fetch(`/api/notebooks/${notebook.id}/cards`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pageId, title, content, diagramType: "none", diagramData: "" }),
                });
                const json = await res.json();
                if (res.ok && json.data) {
                  setCards(prev => [json.data, ...prev]);
                }
              } catch (e) {
                console.error("Failed to save card:", e);
              }
            }}
          />
        )}
      </div>

      {/* Spaced Repetition Flashcard Review Modal */}
      {showReviewModal && (
        <FlashcardReviewModal
          notebookId={notebook.id}
          notebookTitle={notebook.title}
          onClose={() => setShowReviewModal(false)}
        />
      )}
    </div>
  );
}
