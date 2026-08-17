"use client";
import { useRef, useEffect, useCallback, useState } from "react";
import { Stroke } from "@/lib/types";
import { v4 as uuid } from "uuid";
import styles from "./Canvas.module.css";

interface Props {
  notebookId: string;
  pageNumber: number;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  onStrokesChange: (strokes: Stroke[]) => void;
  initialStrokes: Stroke[];
}

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
  const strokesRef = useRef<Stroke[]>(initialStrokes);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const undoStackRef = useRef<Stroke[][]>([initialStrokes]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const redoStackRef = useRef<Stroke[][]>([]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      redrawAll(ctx, strokesRef.current);
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Redraw when page changes or initialStrokes changes
  useEffect(() => {
    strokesRef.current = initialStrokes;
    undoStackRef.current = [initialStrokes];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    redrawAll(ctx, initialStrokes);
  }, [pageNumber, initialStrokes]);

  function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      drawStroke(ctx, stroke);
    }
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

    // Smooth curve through points
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
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Palm rejection: only accept pen or mouse (not finger when pen is active)
      if (e.pointerType === "touch") return;

      e.preventDefault();
      isDrawingRef.current = true;
      const pos = getPos(e);
      const strokeSize = tool === "highlighter"
        ? size * 4
        : tool === "eraser"
        ? size * 6
        : size * (0.5 + pos.pressure * 1.5);

      currentStrokeRef.current = {
        id: uuid(),
        tool: tool === "lasso" ? "pen" : tool,
        color: tool === "eraser" ? "#000000" : color,
        size: strokeSize,
        opacity: tool === "highlighter" ? 0.45 : 1,
        points: [pos],
      };

      const canvas = canvasRef.current!;
      canvas.setPointerCapture(e.pointerId);
    },
    [tool, color, size, getPos]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();

      const pos = getPos(e);

      // Pressure-sensitive size update for pen
      if (tool === "pen" && currentStrokeRef.current.tool === "pen") {
        const dynamicSize = size * (0.5 + pos.pressure * 1.5);
        currentStrokeRef.current.size = dynamicSize;
      }

      currentStrokeRef.current.points.push(pos);

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const pts = currentStrokeRef.current.points;

      // Draw only the last segment incrementally for performance
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

        const prev = pts[pts.length - 2];
        const curr = pts[pts.length - 1];
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
        ctx.restore();
      }
    },
    [getPos, tool, size]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      isDrawingRef.current = false;

      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;

      if (stroke.points.length < 2) return;

      // Save stroke
      const newStrokes = [...strokesRef.current, stroke];
      strokesRef.current = newStrokes;

      // Undo stack
      undoStackRef.current.push(newStrokes);
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);

      // Redraw cleanly (fix highlighter artifacts)
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      redrawAll(ctx, newStrokes);

      onStrokesChange(newStrokes);
    },
    [onStrokesChange]
  );

  // Attach pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
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

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "z") undo();
      if ((e.ctrlKey && e.key === "y") || (e.ctrlKey && e.shiftKey && e.key === "Z")) redo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function undo() {
    const stack = undoStackRef.current;
    if (stack.length <= 1) return;
    const current = stack.pop()!;
    redoStackRef.current.push(current);
    const prev = stack[stack.length - 1];
    strokesRef.current = prev;
    setCanUndo(stack.length > 1);
    setCanRedo(true);
    const canvas = canvasRef.current!;
    redrawAll(canvas.getContext("2d")!, prev);
    onStrokesChange(prev);
  }

  function redo() {
    const redoStack = redoStackRef.current;
    if (redoStack.length === 0) return;
    const next = redoStack.pop()!;
    undoStackRef.current.push(next);
    strokesRef.current = next;
    setCanUndo(true);
    setCanRedo(redoStack.length > 0);
    const canvas = canvasRef.current!;
    redrawAll(canvas.getContext("2d")!, next);
    onStrokesChange(next);
  }

  function clearPage() {
    const newStrokes: Stroke[] = [];
    undoStackRef.current.push(newStrokes);
    redoStackRef.current = [];
    strokesRef.current = newStrokes;
    setCanUndo(true);
    setCanRedo(false);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onStrokesChange(newStrokes);
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
        id="main-canvas"
      />
      {/* Undo / Redo / Clear controls */}
      <div className={styles.actions}>
        <button
          className="btn-icon"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          id="undo-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          id="redo-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={clearPage}
          title="Clear page"
          id="clear-btn"
          style={{ color: "var(--error)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
