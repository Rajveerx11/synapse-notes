"use client";
import { useRef, useEffect, useCallback, useState } from "react";
import { Stroke } from "@/lib/types";
import { v4 as uuid } from "uuid";
import styles from "./Canvas.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50;

interface Props {
  notebookId: string;
  pageNumber: number;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  onStrokesChange: (pageNumber: number, strokes: Stroke[]) => void;
  initialStrokes: Stroke[];
}

type PaperType = "dots" | "ruled" | "graph" | "blank";

// ─── Variable-width Bézier stroke renderer ────────────────────────────────────
/**
 * Draws a single stroke using variable-width segments to simulate S-Pen
 * pressure sensitivity. Each point carries a `pressure` value (0–1) that
 * linearly scales the configured stroke size for that segment.
 */
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

  // Draw segments between consecutive pairs so each segment can have its own
  // lineWidth derived from the average pressure of its two endpoints.
  const pts = stroke.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;
    // Pressure maps 0→0.4× base size, 1→1.6× base size (natural feel)
    const w = stroke.size * (0.4 + avgPressure * 1.2);
    ctx.lineWidth = Math.max(0.5, w);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);

    // Use midpoint quadratic for smooth curves when we have a look-ahead
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

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Canvas({
  pageNumber,
  tool,
  color,
  size,
  onStrokesChange,
  initialStrokes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Overlay canvas for hover cursor (separate layer avoids redraw flicker)
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const strokesRef = useRef<Stroke[]>(initialStrokes);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);

  // Undo/redo stacks — history entries are immutable snapshots of the strokes array.
  // The current state is always at the END of undoStackRef; the initial snapshot
  // is seeded so that undo() always has a base to return to (empty page).
  const undoStackRef = useRef<Stroke[][]>([initialStrokes]);
  const redoStackRef = useRef<Stroke[][]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [paperType, setPaperType] = useState<PaperType>("dots");

  // ─── Canvas resolution & redraw on container resize ───────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      // Main drawing canvas
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      redrawAll(ctx, strokesRef.current);

      // Overlay canvas (same dimensions)
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = width * dpr;
        overlay.height = height * dpr;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        overlay.getContext("2d")!.scale(dpr, dpr);
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Coordinate + pressure extraction ─────────────────────────────────────
  const getPos = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      // S-Pen reports 0–1; mouse always reports 0 or 0.5; default 0.5
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }, []);

  // ─── S-Pen hover cursor on overlay canvas ────────────────────────────────
  const onPointerHover = useCallback((e: PointerEvent) => {
    const overlay = overlayRef.current;
    if (!overlay || isDrawingRef.current) return;
    const ctx = overlay.getContext("2d")!;
    const rect = overlay.getBoundingClientRect();
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Only show stylus hover dot for pen pointer type (S-Pen hover)
    if (e.pointerType !== "pen") return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = Math.max(2, size * 1.5);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "rgba(150,150,150,0.35)" : color + "55";
    ctx.fill();
    ctx.strokeStyle = tool === "eraser" ? "rgba(100,100,100,0.6)" : color + "99";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }, [color, size, tool]);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.getContext("2d")!.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  // ─── Pointer event handlers ───────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Allow both stylus and mouse; block finger touch to prevent scroll conflicts
      if (e.pointerType === "touch") return;
      e.preventDefault();
      clearOverlay();
      isDrawingRef.current = true;

      const pos = getPos(e);
      const baseSize =
        tool === "highlighter" ? size * 4 :
        tool === "eraser"      ? size * 6 :
                                 size; // pressure applied per-segment in drawStroke

      currentStrokeRef.current = {
        id: uuid(),
        tool: tool === "lasso" ? "pen" : tool,
        color: tool === "eraser" ? "#000000" : color,
        size: baseSize,
        opacity: tool === "highlighter" ? 0.45 : 1,
        points: [pos],
      };

      canvasRef.current!.setPointerCapture(e.pointerId);
    },
    [tool, color, size, getPos, clearOverlay]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) {
        // Not drawing — show hover cursor
        onPointerHover(e);
        return;
      }
      e.preventDefault();

      const pos = getPos(e);
      const pts = currentStrokeRef.current.points;
      pts.push(pos);

      // Incremental render: draw only the latest segment for performance
      if (pts.length >= 2) {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        const p0 = pts[pts.length - 2];
        const p1 = pts[pts.length - 1];
        const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const stroke = currentStrokeRef.current;
        if (stroke.tool === "highlighter") {
          ctx.globalCompositeOperation = "multiply";
          ctx.globalAlpha = 0.45;
        } else if (stroke.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.globalAlpha = 1;
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(0.5, stroke.size * (0.4 + avgPressure * 1.2));
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
      }
    },
    [getPos, onPointerHover]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      isDrawingRef.current = false;
      clearOverlay();

      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;

      if (stroke.points.length < 2) return;

      const newStrokes = [...strokesRef.current, stroke];
      strokesRef.current = newStrokes;

      // Push to undo stack; cap history depth to avoid unbounded memory growth
      const stack = undoStackRef.current;
      stack.push(newStrokes);
      if (stack.length > MAX_HISTORY + 1) stack.splice(1, stack.length - MAX_HISTORY - 1);

      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);

      // Full redraw to apply smooth variable-width Bézier rendering
      const canvas = canvasRef.current!;
      redrawAll(canvas.getContext("2d")!, newStrokes);

      onStrokesChange(pageNumber, newStrokes);
    },
    [pageNumber, onStrokesChange, clearOverlay]
  );

  // ─── Attach/detach pointer listeners ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", clearOverlay);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", clearOverlay);
    };
  }, [onPointerDown, onPointerMove, onPointerUp, clearOverlay]);

  // ─── Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) ─────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // undo/redo are stable plain functions defined below — no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Undo ─────────────────────────────────────────────────────────────────
  function undo() {
    const stack = undoStackRef.current;
    // Must have more than the seed entry to undo
    if (stack.length <= 1) return;

    const popped = stack.pop()!;
    redoStackRef.current.push(popped);

    const prev = stack[stack.length - 1];
    strokesRef.current = prev;
    setCanUndo(stack.length > 1);
    setCanRedo(true);

    redrawAll(canvasRef.current!.getContext("2d")!, prev);
    onStrokesChange(pageNumber, prev);
  }

  // ─── Redo ─────────────────────────────────────────────────────────────────
  function redo() {
    const redoStack = redoStackRef.current;
    if (redoStack.length === 0) return;

    const next = redoStack.pop()!;
    undoStackRef.current.push(next);
    strokesRef.current = next;
    setCanUndo(true);
    setCanRedo(redoStack.length > 0);

    redrawAll(canvasRef.current!.getContext("2d")!, next);
    onStrokesChange(pageNumber, next);
  }

  // ─── Clear page ───────────────────────────────────────────────────────────
  function clearPage() {
    const newStrokes: Stroke[] = [];
    undoStackRef.current.push(newStrokes);
    if (undoStackRef.current.length > MAX_HISTORY + 1)
      undoStackRef.current.splice(1, undoStackRef.current.length - MAX_HISTORY - 1);

    redoStackRef.current = [];
    strokesRef.current = newStrokes;
    setCanUndo(true);   // can undo the clear back to previous content
    setCanRedo(false);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onStrokesChange(pageNumber, newStrokes);
  }

  // ─── Paper class ──────────────────────────────────────────────────────────
  const paperClass =
    paperType === "dots"  ? styles.paperDots  :
    paperType === "ruled" ? styles.paperRuled :
    paperType === "graph" ? styles.paperGraph :
                            styles.paperBlank;

  const cursorStyle =
    tool === "eraser" ? "cell" :
    tool === "lasso"  ? "crosshair" :
                        "crosshair";

  return (
    <div ref={containerRef} className={`${styles.container} ${paperClass}`}>
      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: cursorStyle, position: "absolute", top: 0, left: 0 }}
        id="main-canvas"
      />

      {/* Hover-cursor overlay (pointer-events: none so it doesn't intercept) */}
      <canvas
        ref={overlayRef}
        className={styles.canvas}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        id="overlay-canvas"
        aria-hidden="true"
      />

      {/* Floating Bottom Action Bar */}
      <div className={styles.bottomControls}>
        <div className={styles.actionPill}>
          {/* Paper template switcher */}
          <div className={styles.paperSelector}>
            {(["dots", "ruled", "graph", "blank"] as PaperType[]).map((pt) => (
              <button
                key={pt}
                className={`${styles.paperBtn} ${paperType === pt ? styles.activePaper : ""}`}
                onClick={() => setPaperType(pt)}
                title={`${pt.charAt(0).toUpperCase() + pt.slice(1)} Paper`}
                id={`paper-${pt}-btn`}
              >
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          {/* Undo */}
          <button
            className="btn-icon"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            id="undo-btn"
            style={{ width: 28, height: 28 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          {/* Redo */}
          <button
            className="btn-icon"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            id="redo-btn"
            style={{ width: 28, height: 28 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>

          {/* Clear */}
          <button
            className="btn-icon"
            onClick={clearPage}
            title="Clear page (undoable)"
            id="clear-btn"
            style={{ width: 28, height: 28, color: "var(--error)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
