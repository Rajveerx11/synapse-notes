"use client";
import { useRef, useEffect, useCallback, useState } from "react";
import { Stroke } from "@/lib/types";
import { v4 as uuid } from "uuid";
import styles from "./Canvas.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50;

/**
 * Polyfill for CanvasRenderingContext2D.roundRect — not available in older
 * Samsung Internet / Chrome <99 shipping on some Galaxy Tab firmware.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback: manual arc path
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

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

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Ray-casting algorithm: is point (px, py) inside polygon `path`? */
function pointInPolygon(px: number, py: number, path: {x: number; y: number}[]) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].x, yi = path[i].y;
    const xj = path[j].x, yj = path[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Does any point of `stroke` fall inside lasso `path`? */
function strokeInLasso(stroke: Stroke, path: {x: number; y: number}[]) {
  return stroke.points.some(p => pointInPolygon(p.x, p.y, path));
}

/** Compute axis-aligned bounding box of a set of strokes (canvas coords). */
function strokesBBox(strokes: Stroke[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Translate all points in strokes by (dx, dy). Returns new stroke array. */
function translateStrokes(strokes: Stroke[], dx: number, dy: number): Stroke[] {
  return strokes.map(s => ({
    ...s,
    points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })),
  }));
}

// ─── Variable-width Bézier stroke renderer ────────────────────────────────────
/**
 * Draws a stroke using per-segment lineWidth derived from point.pressure so
 * S-Pen pressure maps naturally to ink thickness.
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

  let strokeColor = stroke.color;
  if (typeof document !== "undefined") {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark && (strokeColor === "#1a1917" || strokeColor === "#000000" || strokeColor === "black")) {
      strokeColor = "#f5f4f0";
    }
  }
  ctx.strokeStyle = strokeColor;
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

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

// ─── Selection overlay renderer ───────────────────────────────────────────────
function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  selectedStrokes: Stroke[],
  lassoPath: {x: number; y: number}[] | null,
  isDragging: boolean
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw in-progress lasso path
  if (lassoPath && lassoPath.length > 1) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(59,130,246,0.8)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(59,130,246,0.06)";
    ctx.beginPath();
    ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
    for (let i = 1; i < lassoPath.length; i++) ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw selection bounding box around selected strokes
  if (selectedStrokes.length > 0) {
    const { minX, minY, maxX, maxY } = strokesBBox(selectedStrokes);
    const pad = 8;
    const x = minX - pad, y = minY - pad;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;

    ctx.save();
    // Selection box
    ctx.setLineDash([6, 3]);
    ctx.strokeStyle = isDragging ? "rgba(59,130,246,1)" : "rgba(59,130,246,0.85)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(59,130,246,0.07)";
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();

    // Corner handles
    ctx.setLineDash([]);
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(59,130,246,1)";
    ctx.lineWidth = 1.5;
    for (const [hx, hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Count badge
    if (selectedStrokes.length > 1) {
      const label = `${selectedStrokes.length} strokes`;
      ctx.font = "500 11px Inter, system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      const bx = x + w / 2 - tw / 2 - 6;
      const by = y - 22;
      ctx.fillStyle = "rgba(59,130,246,0.9)";
      ctx.beginPath();
      roundRect(ctx, bx, by, tw + 12, 18, 4);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.fillText(label, bx + 6, by + 13);
    }
    ctx.restore();
  }
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
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Overlay: handles both hover cursor AND lasso/selection visuals
  const overlayRef   = useRef<HTMLCanvasElement>(null);

  const strokesRef      = useRef<Stroke[]>(initialStrokes);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef    = useRef(false);

  // Undo/redo
  const undoStackRef = useRef<Stroke[][]>([initialStrokes]);
  const redoStackRef = useRef<Stroke[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Paper
  const [paperType, setPaperType] = useState<PaperType>("dots");

  // ─── Lasso / selection state ───────────────────────────────────────────────
  type LassoPhase = "idle" | "drawing" | "selected" | "dragging";
  const lassoPhaseRef    = useRef<LassoPhase>("idle");
  const lassoPathRef     = useRef<{x: number; y: number}[]>([]);
  const selectedIdsRef   = useRef<Set<string>>(new Set());
  const dragStartRef     = useRef<{x: number; y: number} | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);

  // Derived: array of currently selected Stroke objects
  const getSelectedStrokes = useCallback(() =>
    strokesRef.current.filter(s => selectedIdsRef.current.has(s.id)),
  []);

  // Clear lasso selection and re-render overlay
  const clearSelection = useCallback(() => {
    lassoPhaseRef.current = "idle";
    lassoPathRef.current = [];
    selectedIdsRef.current = new Set();
    setSelectionCount(0);
    const ov = overlayRef.current;
    if (ov) {
      const ctx = ov.getContext("2d")!;
      ctx.clearRect(0, 0, ov.width, ov.height);
    }
  }, []);

  // Whenever tool changes away from lasso, clear any active selection
  useEffect(() => {
    if (tool !== "lasso") clearSelection();
  }, [tool, clearSelection]);

  // ─── Canvas resolution & redraw on container resize ───────────────────────
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      canvas.width  = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      redrawAll(ctx, strokesRef.current);

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width  = width * dpr;
        overlay.height = height * dpr;
        overlay.style.width  = `${width}px`;
        overlay.style.height = `${height}px`;
        overlay.getContext("2d")!.scale(dpr, dpr);
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Theme change listener — redraw ink with appropriate contrast ─────────
  useEffect(() => {
    const handleThemeChange = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (ctx) redrawAll(ctx, strokesRef.current);
    };
    window.addEventListener("synapse_theme_changed", handleThemeChange);
    return () => window.removeEventListener("synapse_theme_changed", handleThemeChange);
  }, []);

  // ─── Coordinate + pressure extraction ─────────────────────────────────────
  const getPos = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }, []);

  // ─── S-Pen hover cursor on overlay canvas ────────────────────────────────
  const onPointerHover = useCallback((e: PointerEvent) => {
    const overlay = overlayRef.current;
    if (!overlay || isDrawingRef.current || lassoPhaseRef.current !== "idle") return;
    const ctx  = overlay.getContext("2d")!;
    const rect = overlay.getBoundingClientRect();
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (e.pointerType !== "pen") return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = Math.max(2, size * 1.5);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle   = tool === "eraser" ? "rgba(150,150,150,0.35)" : color + "55";
    ctx.fill();
    ctx.strokeStyle = tool === "eraser" ? "rgba(100,100,100,0.6)"  : color + "99";
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();
  }, [color, size, tool]);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // In lasso mode preserve selection overlay; only clear hover dot
    if (lassoPhaseRef.current === "idle" || lassoPhaseRef.current === "drawing") {
      overlay.getContext("2d")!.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  // ─── Push undo snapshot helper ────────────────────────────────────────────
  const pushHistory = useCallback((strokes: Stroke[]) => {
    const stack = undoStackRef.current;
    stack.push(strokes);
    if (stack.length > MAX_HISTORY + 1) stack.splice(1, stack.length - MAX_HISTORY - 1);
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // ─── Pointer event handlers ───────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      e.preventDefault();

      const pos = getPos(e);

      // ── Lasso tool ────────────────────────────────────────────────────────
      if (tool === "lasso") {
        const phase = lassoPhaseRef.current;

        // If there's a selection and user clicks inside bbox → start dragging
        if (phase === "selected" && selectedIdsRef.current.size > 0) {
          const sel = getSelectedStrokes();
          if (sel.length > 0) {
            const { minX, minY, maxX, maxY } = strokesBBox(sel);
            const pad = 8;
            if (
              pos.x >= minX - pad && pos.x <= maxX + pad &&
              pos.y >= minY - pad && pos.y <= maxY + pad
            ) {
              lassoPhaseRef.current = "dragging";
              dragStartRef.current  = { x: pos.x, y: pos.y };
              canvasRef.current!.setPointerCapture(e.pointerId);
              return;
            }
          }
          // Clicked outside selection — clear and start new lasso
          clearSelection();
        }

        // Start drawing lasso path
        lassoPhaseRef.current  = "drawing";
        lassoPathRef.current   = [{ x: pos.x, y: pos.y }];
        canvasRef.current!.setPointerCapture(e.pointerId);
        return;
      }

      // ── Drawing tools (pen / highlighter / eraser) ────────────────────────
      clearSelection();
      clearOverlay();
      isDrawingRef.current = true;

      const baseSize =
        tool === "highlighter" ? size * 4 :
        tool === "eraser"      ? size * 6 :
                                 size;

      currentStrokeRef.current = {
        id:      uuid(),
        tool:    tool,
        color:   tool === "eraser" ? "#000000" : color,
        size:    baseSize,
        opacity: tool === "highlighter" ? 0.45 : 1,
        points:  [pos],
      };

      canvasRef.current!.setPointerCapture(e.pointerId);
    },
    [tool, color, size, getPos, clearSelection, clearOverlay, getSelectedStrokes]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const pos = getPos(e);

      // ── Lasso drawing ────────────────────────────────────────────────────
      if (tool === "lasso") {
        if (lassoPhaseRef.current === "drawing") {
          e.preventDefault();
          lassoPathRef.current.push({ x: pos.x, y: pos.y });
          const ov = overlayRef.current!;
          drawSelectionOverlay(ov.getContext("2d")!, [], lassoPathRef.current, false);
          return;
        }

        // ── Drag selected strokes ────────────────────────────────────────
        if (lassoPhaseRef.current === "dragging" && dragStartRef.current) {
          e.preventDefault();
          const dx = pos.x - dragStartRef.current.x;
          const dy = pos.y - dragStartRef.current.y;
          dragStartRef.current = { x: pos.x, y: pos.y };

          // Move selected strokes
          const ids = selectedIdsRef.current;
          strokesRef.current = strokesRef.current.map(s =>
            ids.has(s.id)
              ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
              : s
          );

          // Redraw main canvas
          redrawAll(canvasRef.current!.getContext("2d")!, strokesRef.current);

          // Update overlay
          const sel = getSelectedStrokes();
          drawSelectionOverlay(overlayRef.current!.getContext("2d")!, sel, null, true);
          return;
        }

        // Hover in lasso idle/selected phase
        onPointerHover(e);
        return;
      }

      // ── Drawing stroke ───────────────────────────────────────────────────
      if (!isDrawingRef.current || !currentStrokeRef.current) {
        onPointerHover(e);
        return;
      }
      e.preventDefault();

      currentStrokeRef.current.points.push(pos);
      const pts    = currentStrokeRef.current.points;
      if (pts.length >= 2) {
        const canvas = canvasRef.current!;
        const ctx    = canvas.getContext("2d")!;
        const p0 = pts[pts.length - 2];
        const p1 = pts[pts.length - 1];
        const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;
        const stroke = currentStrokeRef.current;

        ctx.save();
        ctx.lineCap   = "round";
        ctx.lineJoin  = "round";

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
        ctx.lineWidth   = Math.max(0.5, stroke.size * (0.4 + avgPressure * 1.2));
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
      }
    },
    [getPos, onPointerHover, getSelectedStrokes, tool]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const pos = getPos(e);

      // ── Finalize lasso ───────────────────────────────────────────────────
      if (tool === "lasso") {
        if (lassoPhaseRef.current === "drawing") {
          lassoPathRef.current.push({ x: pos.x, y: pos.y });
          const path = lassoPathRef.current;

          // Detect which strokes are enclosed by the lasso
          const enclosed = strokesRef.current.filter(s => strokeInLasso(s, path));
          if (enclosed.length > 0) {
            selectedIdsRef.current = new Set(enclosed.map(s => s.id));
            lassoPhaseRef.current  = "selected";
            setSelectionCount(enclosed.length);
          } else {
            clearSelection();
          }

          // Redraw overlay with selection box (clear lasso path)
          const sel = getSelectedStrokes();
          lassoPathRef.current = [];
          drawSelectionOverlay(overlayRef.current!.getContext("2d")!, sel, null, false);
          return;
        }

        if (lassoPhaseRef.current === "dragging") {
          lassoPhaseRef.current = "selected";
          // Commit moved strokes to history
          pushHistory(strokesRef.current);
          onStrokesChange(pageNumber, strokesRef.current);
          const sel = getSelectedStrokes();
          drawSelectionOverlay(overlayRef.current!.getContext("2d")!, sel, null, false);
          return;
        }
        return;
      }

      // ── Finalize ink stroke ──────────────────────────────────────────────
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      isDrawingRef.current = false;
      clearOverlay();

      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      if (stroke.points.length < 2) return;

      const newStrokes = [...strokesRef.current, stroke];
      strokesRef.current = newStrokes;
      pushHistory(newStrokes);

      // Full redraw to apply smooth Bézier rendering
      redrawAll(canvasRef.current!.getContext("2d")!, newStrokes);
      onStrokesChange(pageNumber, newStrokes);
    },
    [getPos, tool, clearSelection, getSelectedStrokes, pushHistory, pageNumber, onStrokesChange, clearOverlay]
  );

  // ─── Attach/detach pointer listeners ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("pointerdown",  onPointerDown,  { passive: false });
    canvas.addEventListener("pointermove",  onPointerMove,  { passive: false });
    canvas.addEventListener("pointerup",    onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", clearOverlay);

    return () => {
      canvas.removeEventListener("pointerdown",  onPointerDown);
      canvas.removeEventListener("pointermove",  onPointerMove);
      canvas.removeEventListener("pointerup",    onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", clearOverlay);
    };
  }, [onPointerDown, onPointerMove, onPointerUp, clearOverlay]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Undo / Redo
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }

      // Delete / Backspace — remove selected strokes
      if ((e.key === "Delete" || e.key === "Backspace") && lassoPhaseRef.current === "selected") {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Ctrl+D — duplicate selected strokes
      if (e.ctrlKey && e.key === "d" && lassoPhaseRef.current === "selected") {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Escape — clear selection
      if (e.key === "Escape") {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection]);

  // ─── Undo ─────────────────────────────────────────────────────────────────
  function undo() {
    const stack = undoStackRef.current;
    if (stack.length <= 1) return;

    const popped = stack.pop()!;
    redoStackRef.current.push(popped);
    const prev = stack[stack.length - 1];
    strokesRef.current = prev;
    setCanUndo(stack.length > 1);
    setCanRedo(true);
    clearSelection();

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
    clearSelection();

    redrawAll(canvasRef.current!.getContext("2d")!, next);
    onStrokesChange(pageNumber, next);
  }

  // ─── Clear page ───────────────────────────────────────────────────────────
  function clearPage() {
    const newStrokes: Stroke[] = [];
    pushHistory(newStrokes);
    strokesRef.current = newStrokes;
    clearSelection();

    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onStrokesChange(pageNumber, newStrokes);
  }

  // ─── Delete selected strokes ──────────────────────────────────────────────
  function deleteSelected() {
    if (selectedIdsRef.current.size === 0) return;
    const ids = selectedIdsRef.current;
    const newStrokes = strokesRef.current.filter(s => !ids.has(s.id));
    strokesRef.current = newStrokes;
    pushHistory(newStrokes);
    clearSelection();
    redrawAll(canvasRef.current!.getContext("2d")!, newStrokes);
    onStrokesChange(pageNumber, newStrokes);
  }

  // ─── Duplicate selected strokes ───────────────────────────────────────────
  function duplicateSelected() {
    const sel = getSelectedStrokes();
    if (sel.length === 0) return;

    const dupes = translateStrokes(sel, 16, 16).map(s => ({ ...s, id: uuid() }));
    const newStrokes = [...strokesRef.current, ...dupes];
    strokesRef.current = newStrokes;
    pushHistory(newStrokes);

    // Select the new duplicates
    selectedIdsRef.current = new Set(dupes.map(s => s.id));
    lassoPhaseRef.current = "selected";
    setSelectionCount(dupes.length);

    redrawAll(canvasRef.current!.getContext("2d")!, newStrokes);
    drawSelectionOverlay(
      overlayRef.current!.getContext("2d")!,
      dupes, null, false
    );
    onStrokesChange(pageNumber, newStrokes);
  }

  // ─── Paper class ──────────────────────────────────────────────────────────
  const paperClass =
    paperType === "dots"  ? styles.paperDots  :
    paperType === "ruled" ? styles.paperRuled :
    paperType === "graph" ? styles.paperGraph :
                            styles.paperBlank;

  const cursorStyle = tool === "eraser" ? "cell" : tool === "lasso" ? "default" : "crosshair";

  return (
    <div ref={containerRef} className={`${styles.container} ${paperClass}`}>
      {/* Main drawing canvas */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: cursorStyle, position: "absolute", top: 0, left: 0 }}
        id="main-canvas"
      />

      {/* Overlay: hover cursor + lasso path + selection handles (no pointer events) */}
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

          {/* Lasso selection actions (visible when something is selected) */}
          {selectionCount > 0 && (
            <>
              <button
                className="btn-icon"
                onClick={duplicateSelected}
                title={`Duplicate ${selectionCount} stroke${selectionCount > 1 ? "s" : ""} (Ctrl+D)`}
                id="duplicate-btn"
                style={{ width: 28, height: 28, color: "var(--accent)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="8" y="8" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button
                className="btn-icon"
                onClick={deleteSelected}
                title={`Delete ${selectionCount} stroke${selectionCount > 1 ? "s" : ""} (Delete)`}
                id="delete-selected-btn"
                style={{ width: 28, height: 28, color: "var(--error)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
              <div className={styles.divider} />
            </>
          )}

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
