"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Stroke, PdfAnnotation } from "@/lib/types";
import { v4 as uuid } from "uuid";
import PDFExportModal from "./PDFExportModal";
import styles from "./AnnotatedPDFCanvas.module.css";

interface Props {
  url: string;
  notebookId?: string;
  notebookTitle?: string;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  pageNumber: number;
  onPageChange: (page: number) => void;
  initialStrokes: Stroke[];
  onStrokesChange: (pageNumber: number, strokes: Stroke[]) => void;
  onPdfUrlChange?: (newUrl: string) => void;
  onClose: () => void;
}

export default function AnnotatedPDFCanvas({
  url,
  notebookId,
  notebookTitle,
  tool,
  color,
  size,
  pageNumber,
  onPageChange,
  initialStrokes,
  onStrokesChange,
  onPdfUrlChange,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Structured Annotation Layer State
  const [annMode, setAnnMode] = useState<"ink" | "highlight" | "underline" | "sticky">("ink");
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [allAnnotations, setAllAnnotations] = useState<PdfAnnotation[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  const strokesRef = useRef<Stroke[]>(initialStrokes);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const undoStackRef = useRef<Stroke[][]>([initialStrokes]);
  const redoStackRef = useRef<Stroke[][]>([]);

  // Load PDF Document
  useEffect(() => {
    let cancelled = false;
    async function loadPDF() {
      setLoading(true);
      setPdfError("");
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setPdfError(error instanceof Error ? error.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    }
    loadPDF();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Load annotations from DB for this notebook
  const loadAnnotations = useCallback(async () => {
    if (!notebookId) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/annotations`);
      const json = await res.json();
      if (res.ok && json.data) {
        setAllAnnotations(json.data);
        setAnnotations(json.data.filter((a: PdfAnnotation) => a.page_number === pageNumber));
      }
    } catch (e) {
      console.warn("Failed to load PDF annotations:", e);
    }
  }, [notebookId, pageNumber]);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Render PDF slide and restore strokes for this specific page
  useEffect(() => {
    if (!pdfDocRef.current || loading) return;
    strokesRef.current = initialStrokes;
    undoStackRef.current = [initialStrokes];
    redoStackRef.current = [];
    renderPage(pdfDocRef.current, pageNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pageNumber, initialStrokes]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderPage(pdf: any, pageNum: number) {
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!pdfCanvas || !drawCanvas || !container) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
    }

    try {
      const page = await pdf.getPage(pageNum);
      const containerW = container.clientWidth - 48;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerW / unscaledViewport.width, 1.8);
      const viewport = page.getViewport({ scale });

      const dpr = window.devicePixelRatio || 1;
      pdfCanvas.width = viewport.width * dpr;
      pdfCanvas.height = viewport.height * dpr;
      pdfCanvas.style.width = `${viewport.width}px`;
      pdfCanvas.style.height = `${viewport.height}px`;

      drawCanvas.width = viewport.width * dpr;
      drawCanvas.height = viewport.height * dpr;
      drawCanvas.style.width = `${viewport.width}px`;
      drawCanvas.style.height = `${viewport.height}px`;

      const pdfCtx = pdfCanvas.getContext("2d")!;
      pdfCtx.scale(dpr, dpr);

      const drawCtx = drawCanvas.getContext("2d")!;
      drawCtx.scale(dpr, dpr);

      renderTaskRef.current = page.render({
        canvasContext: pdfCtx,
        viewport,
      });
      await renderTaskRef.current.promise;
      redrawAll(drawCtx, strokesRef.current, viewport.width, viewport.height);
    } catch {}
  }

  function redrawAll(
    ctx: CanvasRenderingContext2D,
    strokes: Stroke[],
    w: number,
    h: number
  ) {
    ctx.clearRect(0, 0, w, h);
    for (const stroke of strokes) drawStroke(ctx, stroke);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (!stroke?.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (stroke.tool === "highlighter") {
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.45;
    } else if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = stroke.opacity ?? 1;
    }

    ctx.strokeStyle = stroke.color;
    const pts = stroke.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;
      ctx.lineWidth = Math.max(0.5, stroke.size * (0.4 + avgPressure * 1.2));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      if (i < pts.length - 2) {
        const mx = (p1.x + pts[i + 2].x) / 2;
        const my = (p1.y + pts[i + 2].y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
      } else {
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const getPos = useCallback((e: PointerEvent) => {
    const canvas = drawCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }, []);

  // Pointer event handlers supporting both ink & structured annotations
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      e.preventDefault();
      const pos = getPos(e);

      if (annMode === "sticky") {
        // Drop sticky note
        if (!notebookId) return;
        const newSticky: PdfAnnotation = {
          id: uuid(),
          notebook_id: notebookId,
          page_number: pageNumber,
          type: "sticky",
          x: pos.x,
          y: pos.y,
          width: 180,
          height: 100,
          color: "#fef08a",
          text: "New note…",
          created_at: Math.floor(Date.now() / 1000),
        };
        setAnnotations(prev => [...prev, newSticky]);
        setAllAnnotations(prev => [...prev, newSticky]);
        fetch(`/api/notebooks/${notebookId}/annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSticky),
        }).catch(err => console.warn("Failed to persist sticky note:", err));
        setAnnMode("ink");
        return;
      }

      if (annMode === "highlight" || annMode === "underline") {
        dragStartRef.current = { x: pos.x, y: pos.y };
        currentRectRef.current = { x: pos.x, y: pos.y, width: 0, height: 0 };
        return;
      }

      // Ink drawing mode
      isDrawingRef.current = true;
      const baseSize =
        tool === "highlighter" ? size * 4 :
        tool === "eraser"      ? size * 6 :
                                 size;
      currentStrokeRef.current = {
        id: uuid(),
        tool: tool === "lasso" ? "pen" : tool,
        color: tool === "eraser" ? "#000" : color,
        size: baseSize,
        opacity: tool === "highlighter" ? 0.45 : 1,
        points: [pos],
      };
      drawCanvasRef.current?.setPointerCapture(e.pointerId);
    },
    [annMode, tool, color, size, getPos, notebookId, pageNumber]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const pos = getPos(e);

      if ((annMode === "highlight" || annMode === "underline") && dragStartRef.current) {
        const start = dragStartRef.current;
        const width = pos.x - start.x;
        const height = annMode === "underline" ? 4 : pos.y - start.y;
        currentRectRef.current = {
          x: width < 0 ? pos.x : start.x,
          y: height < 0 ? pos.y : start.y,
          width: Math.abs(width),
          height: Math.max(4, Math.abs(height)),
        };
        return;
      }

      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      currentStrokeRef.current.points.push(pos);
      const canvas = drawCanvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const pts = currentStrokeRef.current.points;
      if (pts.length >= 2) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (currentStrokeRef.current.tool === "highlighter") {
          ctx.globalCompositeOperation = "multiply";
          ctx.globalAlpha = 0.45;
        } else if (currentStrokeRef.current.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.globalAlpha = 1;
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        const stroke = currentStrokeRef.current;
        const p0 = pts[pts.length - 2];
        const p1 = pts[pts.length - 1];
        const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(0.5, stroke.size * (0.4 + avgPressure * 1.2));
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
      }
    },
    [annMode, getPos]
  );

  const onPointerUp = useCallback(() => {
    if ((annMode === "highlight" || annMode === "underline") && dragStartRef.current && currentRectRef.current) {
      const rect = currentRectRef.current;
      dragStartRef.current = null;
      currentRectRef.current = null;

      if (rect.width > 5 && notebookId) {
        const newAnn: PdfAnnotation = {
          id: uuid(),
          notebook_id: notebookId,
          page_number: pageNumber,
          type: annMode,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: annMode === "highlight" ? "#fde047" : "#2d6ef6",
          text: annMode === "highlight" ? "Highlight" : "Underline",
          created_at: Math.floor(Date.now() / 1000),
        };
        setAnnotations(prev => [...prev, newAnn]);
        setAllAnnotations(prev => [...prev, newAnn]);
        fetch(`/api/notebooks/${notebookId}/annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAnn),
        }).catch(err => console.warn("Failed to persist annotation:", err));
      }
      return;
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (stroke.points.length < 2) return;

    const newStrokes = [...strokesRef.current, stroke];
    strokesRef.current = newStrokes;
    undoStackRef.current.push(newStrokes);
    redoStackRef.current = [];

    const canvas = drawCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    redrawAll(ctx, newStrokes, canvas.clientWidth, canvas.clientHeight);
    onStrokesChange(pageNumber, newStrokes);
  }, [annMode, notebookId, pageNumber, onStrokesChange]);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerDown, onPointerMove, onPointerUp]);

  function undo() {
    const stack = undoStackRef.current;
    if (stack.length <= 1) return;
    const cur = stack.pop()!;
    redoStackRef.current.push(cur);
    const prev = stack[stack.length - 1];
    strokesRef.current = prev;
    const canvas = drawCanvasRef.current!;
    redrawAll(
      canvas.getContext("2d")!,
      prev,
      canvas.clientWidth,
      canvas.clientHeight
    );
    onStrokesChange(pageNumber, prev);
  }

  const deleteAnnotation = async (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setAllAnnotations(prev => prev.filter(a => a.id !== id));
    try {
      await fetch(`/api/notebooks/${notebookId}/annotations?annotationId=${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Failed to delete annotation:", e);
    }
  };

  // ── Handle Modal Export ───────────────────
  async function handleModalExport(options: { filename: string; mode: "replace" | "copy" }) {
    setIsExporting(true);
    try {
      const canvas = drawCanvasRef.current!;
      const res = await fetch("/api/pdf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfUrl: url,
          strokes: strokesRef.current,
          annotations: allAnnotations,
          canvasWidth: canvas.clientWidth,
          canvasHeight: canvas.clientHeight,
          replaceOriginal: options.mode === "replace",
          notebookId,
          pageNumber,
          customFilename: options.filename,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Export failed");
      }

      const json = await res.json();
      const newUrl = json.data?.url;

      if (options.mode === "replace") {
        if (onPdfUrlChange && newUrl) {
          onPdfUrlChange(newUrl);
        }
        alert("✅ Notebook slide deck successfully updated with your vector annotations!");
      } else {
        setExportUrl(newUrl);
        const link = document.createElement("a");
        link.href = newUrl;
        link.download = `${options.filename}.pdf`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: unknown) {
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsExporting(false);
      setShowExportModal(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <PDFExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleModalExport}
        defaultTitle={`${notebookTitle || "notebook"}-slide-${pageNumber}`}
        isExporting={isExporting}
        hasOriginalPdf={true}
      />

      {/* Controls Bar */}
      <div className={styles.controls}>
        <button className="btn-icon" onClick={undo} title="Undo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>

        {/* Structured Annotation Subtools */}
        <div className={styles.toolGroup}>
          <button
            className={`${styles.toolBtn} ${annMode === "ink" ? styles.toolBtnActive : ""}`}
            onClick={() => setAnnMode("ink")}
            id="pdf-tool-ink"
            title="Freehand S-Pen Ink"
          >
            ✏️ Ink
          </button>
          <button
            className={`${styles.toolBtn} ${annMode === "highlight" ? styles.toolBtnActive : ""}`}
            onClick={() => setAnnMode("highlight")}
            id="pdf-tool-highlight"
            title="Highlight Box (drag to select area)"
          >
            🟡 Highlight
          </button>
          <button
            className={`${styles.toolBtn} ${annMode === "underline" ? styles.toolBtnActive : ""}`}
            onClick={() => setAnnMode("underline")}
            id="pdf-tool-underline"
            title="Underline Passages"
          >
            📏 Underline
          </button>
          <button
            className={`${styles.toolBtn} ${annMode === "sticky" ? styles.toolBtnActive : ""}`}
            onClick={() => setAnnMode("sticky")}
            id="pdf-tool-sticky"
            title="Place Sticky Note (click on slide)"
          >
            📝 Note
          </button>
        </div>

        {/* Paginator */}
        <div className={styles.paginator}>
          <button
            className="btn-icon"
            onClick={() => onPageChange(pageNumber - 1)}
            disabled={pageNumber <= 1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className={styles.pageInfo}>
            {loading ? "Loading…" : `Slide ${pageNumber} / ${numPages}`}
          </span>
          <button
            className="btn-icon"
            onClick={() => onPageChange(pageNumber + 1)}
            disabled={pageNumber >= numPages}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowExportModal(true)}
          disabled={loading}
          id="export-pdf-btn"
          style={{ fontSize: "var(--text-xs)", padding: "6px 14px" }}
        >
          <span>Export PDF ▾</span>
        </button>

        <button
          className={`btn btn-ghost ${showDrawer ? "active" : ""}`}
          onClick={() => setShowDrawer(d => !d)}
          style={{ fontSize: "var(--text-xs)", padding: "6px 10px" }}
          id="toggle-annotations-drawer"
          title="View structured annotations index"
        >
          📋 Index ({allAnnotations.length})
        </button>

        {exportUrl && (
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            style={{ fontSize: "var(--text-xs)", padding: "6px 12px", color: "var(--success)" }}
          >
            ↓ Download
          </a>
        )}

        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}
        >
          Close PDF
        </button>
      </div>

      {/* Main Layout with Canvas + Optional Annotation Drawer */}
      <div className={styles.mainLayout}>
        <div ref={containerRef} className={styles.canvasContainer}>
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading PDF…</p>
            </div>
          )}
          {pdfError && !loading && (
            <div className={styles.errorState} role="alert">
              <strong>PDF could not be opened</strong>
              <span>{pdfError}</span>
            </div>
          )}
          <div className={styles.canvasStack}>
            <canvas ref={pdfCanvasRef} className={styles.pdfCanvas} />
            <canvas
              ref={drawCanvasRef}
              className={styles.drawCanvas}
              style={{
                cursor:
                  annMode === "sticky" ? "copy" :
                  annMode === "highlight" || annMode === "underline" ? "crosshair" :
                  tool === "eraser" ? "cell" : "crosshair",
              }}
            />

            {/* SVG Structured Annotation Layer (Highlights & Underlines) */}
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            >
              {annotations.map((ann) => {
                if (ann.type === "highlight") {
                  return (
                    <rect
                      key={ann.id}
                      x={ann.x}
                      y={ann.y}
                      width={ann.width}
                      height={ann.height}
                      fill={ann.color || "rgba(253, 224, 71, 0.45)"}
                      opacity={0.45}
                      rx={2}
                    />
                  );
                }
                if (ann.type === "underline") {
                  return (
                    <rect
                      key={ann.id}
                      x={ann.x}
                      y={ann.y + ann.height - 3}
                      width={ann.width}
                      height={3}
                      fill={ann.color || "#2d6ef6"}
                      rx={1.5}
                    />
                  );
                }
                return null;
              })}
            </svg>

            {/* Sticky Notes Overlay */}
            {annotations
              .filter(ann => ann.type === "sticky")
              .map(ann => (
                <div
                  key={ann.id}
                  className={styles.stickyNote}
                  style={{ top: `${ann.y}px`, left: `${ann.x}px` }}
                >
                  <div className={styles.stickyHeader}>
                    <span>Note</span>
                    <button
                      className={styles.stickyClose}
                      onClick={() => deleteAnnotation(ann.id)}
                      title="Delete Note"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    className={styles.stickyTextarea}
                    defaultValue={ann.text}
                    placeholder="Type note…"
                    onChange={(e) => {
                      ann.text = e.target.value;
                    }}
                  />
                </div>
              ))}
          </div>
        </div>

        {/* Side Annotation Drawer */}
        {showDrawer && (
          <aside className={styles.annotationDrawer} role="complementary" aria-label="PDF Annotations Index">
            <div className={styles.drawerHeader}>
              <span>Annotations ({allAnnotations.length})</span>
              <button className="btn-icon" onClick={() => setShowDrawer(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className={styles.drawerList}>
              {allAnnotations.length === 0 ? (
                <p style={{ padding: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
                  No annotations on this slide deck yet.
                </p>
              ) : (
                allAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={styles.annotationItem}
                    onClick={() => {
                      if (ann.page_number !== pageNumber) {
                        onPageChange(ann.page_number);
                      }
                    }}
                  >
                    <div className={styles.annotationTop}>
                      <span className={styles.annotationBadge}>Slide {ann.page_number}</span>
                      <button
                        className="btn-icon"
                        style={{ padding: 2, height: "auto" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAnnotation(ann.id);
                        }}
                        title="Delete annotation"
                      >
                        🗑️
                      </button>
                    </div>
                    <span className={styles.annotationText}>
                      {ann.type === "sticky" ? ann.text || "Sticky Note" : ann.type === "highlight" ? "🟡 Highlight Region" : "📏 Underline Segment"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
