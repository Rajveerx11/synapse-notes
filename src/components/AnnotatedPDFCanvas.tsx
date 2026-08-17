"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Stroke } from "@/lib/types";
import { v4 as uuid } from "uuid";
import styles from "./AnnotatedPDFCanvas.module.css";

interface Props {
  url: string;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  initialStrokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onClose: () => void;
}

export default function AnnotatedPDFCanvas({
  url,
  tool,
  color,
  size,
  initialStrokes,
  onStrokesChange,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  const strokesRef = useRef<Stroke[]>(initialStrokes);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const undoStackRef = useRef<Stroke[][]>([initialStrokes]);
  const redoStackRef = useRef<Stroke[][]>([]);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    async function loadPDF() {
      setLoading(true);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    loadPDF();
    return () => { cancelled = true; };
  }, [url]);

  // Render PDF page whenever current page or loading changes
  useEffect(() => {
    if (!pdfDocRef.current || loading) return;
    renderPage(pdfDocRef.current, currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentPage]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderPage(pdf: any, pageNum: number) {
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!pdfCanvas || !drawCanvas || !container) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }

    const page = await pdf.getPage(pageNum);
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      containerWidth / viewport.width,
      containerHeight / viewport.height,
    ) * 0.95;
    const scaledViewport = page.getViewport({ scale });

    const dpr = window.devicePixelRatio || 1;
    const w = scaledViewport.width;
    const h = scaledViewport.height;

    // Size both canvases identically
    for (const canvas of [pdfCanvas, drawCanvas]) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const pdfCtx = pdfCanvas.getContext("2d")!;
    pdfCtx.scale(dpr, dpr);
    const task = page.render({ canvasContext: pdfCtx, viewport: scaledViewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {}

    // Restore strokes on draw canvas
    const drawCtx = drawCanvas.getContext("2d")!;
    drawCtx.scale(dpr, dpr);
    redrawAll(drawCtx, strokesRef.current, w, h);
  }

  function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
    for (const stroke of strokes) drawStroke(ctx, stroke);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
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
      ctx.globalAlpha = stroke.opacity;
    }

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
    }
    const last = stroke.points[stroke.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  const getPos = useCallback((e: PointerEvent) => {
    const canvas = drawCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
  }, []);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getPos(e);
    const strokeSize = tool === "highlighter" ? size * 4 : tool === "eraser" ? size * 6 : size * (0.5 + pos.pressure * 1.5);
    currentStrokeRef.current = {
      id: uuid(),
      tool: tool === "lasso" ? "pen" : tool,
      color: tool === "eraser" ? "#000" : color,
      size: strokeSize,
      opacity: 1,
      points: [pos],
    };
    drawCanvasRef.current?.setPointerCapture(e.pointerId);
  }, [tool, color, size, getPos]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
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
      ctx.strokeStyle = currentStrokeRef.current.color;
      ctx.lineWidth = currentStrokeRef.current.size;
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.restore();
    }
  }, [getPos]);

  const onPointerUp = useCallback(() => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (stroke.points.length < 2) return;

    const newStrokes = [...strokesRef.current, stroke];
    strokesRef.current = newStrokes;
    undoStackRef.current.push(newStrokes);
    redoStackRef.current = [];

    // Clean redraw
    const canvas = drawCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    redrawAll(ctx, newStrokes, canvas.clientWidth, canvas.clientHeight);
    onStrokesChange(newStrokes);
  }, [onStrokesChange]);

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
    redrawAll(canvas.getContext("2d")!, prev, canvas.clientWidth, canvas.clientHeight);
    onStrokesChange(prev);
  }

  async function exportAnnotatedPDF() {
    setExporting(true);
    setExportUrl(null);
    const canvas = drawCanvasRef.current!;
    const res = await fetch("/api/pdf/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfUrl: url,
        strokes: strokesRef.current,
        canvasWidth: canvas.clientWidth,
        canvasHeight: canvas.clientHeight,
      }),
    });
    setExporting(false);
    if (res.ok) {
      const json = await res.json();
      setExportUrl(json.data.url);
    }
  }

  async function goToPage(p: number) {
    if (!pdfDocRef.current || p < 1 || p > numPages) return;
    setCurrentPage(p);
  }

  return (
    <div className={styles.wrapper}>
      {/* Controls Bar */}
      <div className={styles.controls}>
        <button className="btn-icon" onClick={undo} title="Undo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <div className={styles.paginator}>
          <button className="btn-icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className={styles.pageInfo}>
            {loading ? "Loading…" : `${currentPage} / ${numPages}`}
          </span>
          <button className="btn-icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={exportAnnotatedPDF}
          disabled={exporting}
          id="export-pdf-btn"
          style={{ fontSize: "var(--text-xs)", padding: "6px 12px" }}
        >
          {exporting ? "Exporting…" : "Export PDF"}
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
        <button className="btn btn-ghost" onClick={onClose} style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>
          Close PDF
        </button>
      </div>

      {/* Canvas Stack */}
      <div ref={containerRef} className={styles.canvasContainer}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading PDF…</p>
          </div>
        )}
        <div className={styles.canvasStack}>
          <canvas ref={pdfCanvasRef} className={styles.pdfCanvas} />
          <canvas
            ref={drawCanvasRef}
            className={styles.drawCanvas}
            style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
          />
        </div>
      </div>
    </div>
  );
}
