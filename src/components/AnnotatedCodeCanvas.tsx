"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Stroke } from "@/lib/types";
import { SupportedLanguage } from "@/lib/codeHighlighter";
import CodeEditorBlock from "./CodeEditorBlock";
import { v4 as uuid } from "uuid";
import styles from "./AnnotatedCodeCanvas.module.css";

interface Props {
  notebookId: string;
  pageNumber: number;
  code: string;
  language: SupportedLanguage;
  lineHeightRatio: number;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  initialStrokes: Stroke[];
  onCodeChange: (code: string) => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onLineHeightChange: (ratio: number) => void;
  onStrokesChange: (pageNumber: number, strokes: Stroke[]) => void;
}

export default function AnnotatedCodeCanvas({
  pageNumber,
  code,
  language,
  lineHeightRatio,
  tool,
  color,
  size,
  initialStrokes,
  onCodeChange,
  onLanguageChange,
  onLineHeightChange,
  onStrokesChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [history, setHistory] = useState<Stroke[][]>([initialStrokes]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const lines = code.split("\n");
  const fontSizePx = 14;
  const computedLineHeightPx = Math.round(fontSizePx * lineHeightRatio);

  // Sync internal strokes when initialStrokes prop changes externally
  useEffect(() => {
    setStrokes(initialStrokes);
  }, [initialStrokes]);

  // ── Render strokes onto canvas ───────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";

    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      let drawColor = stroke.color;
      if (isDark) {
        if (stroke.color === "#1a1917" || stroke.color === "#000000" || stroke.color === "#111827") {
          drawColor = "#f3f4f6";
        }
      }

      if (stroke.tool === "highlighter") {
        ctx.strokeStyle = drawColor;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = stroke.size * 3.5;
      } else {
        ctx.strokeStyle = drawColor;
        ctx.globalAlpha = stroke.opacity;
        ctx.lineWidth = stroke.size;
      }

      if (stroke.points.length === 1) {
        const pt = stroke.points[0];
        ctx.arc(pt.x, pt.y, (stroke.size * (pt.pressure || 1)) / 2, 0, Math.PI * 2);
        ctx.fillStyle = drawColor;
        ctx.fill();
      } else {
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const p1 = stroke.points[i];
          const p2 = stroke.points[i + 1];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          ctx.lineWidth = stroke.size * (p1.pressure || 1);
          ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        }
        const last = stroke.points[stroke.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [strokes]);

  // Adjust canvas dimensions to match container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!container || !canvas || !overlay) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = Math.max(rect.height, lines.length * computedLineHeightPx + 150) * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${Math.max(rect.height, lines.length * computedLineHeightPx + 150)}px`;

      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlay.style.width = canvas.style.width;
      overlay.style.height = canvas.style.height;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      const overlayCtx = overlay.getContext("2d");
      if (overlayCtx) overlayCtx.scale(dpr, dpr);

      redrawCanvas();
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [lines.length, computedLineHeightPx, redrawCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // ── Line-Anchored Coordinates Handler ────────────────────────────────
  const handleCodeChangeWithAnchors = (newCode: string) => {
    const oldLines = code.split("\n");
    const newLines = newCode.split("\n");

    // If line count changed, adjust downstream anchored strokes
    if (newLines.length !== oldLines.length) {
      const lineDiff = newLines.length - oldLines.length;
      const shiftPx = lineDiff * computedLineHeightPx;

      // Find first modified line index
      let firstDiffLine = 0;
      while (
        firstDiffLine < oldLines.length &&
        firstDiffLine < newLines.length &&
        oldLines[firstDiffLine] === newLines[firstDiffLine]
      ) {
        firstDiffLine++;
      }

      setStrokes((prev) => {
        const updated = prev.map((s) => {
          if (s.anchor_line !== undefined && s.anchor_line > firstDiffLine) {
            return {
              ...s,
              anchor_line: s.anchor_line + lineDiff,
              points: s.points.map((p) => ({
                ...p,
                y: p.y + shiftPx,
              })),
            };
          }
          return s;
        });
        onStrokesChange(pageNumber, updated);
        return updated;
      });
    }

    onCodeChange(newCode);
  };

  // ── Pointer drawing handlers ─────────────────────────────────────────
  const getCanvasCoords = (e: React.PointerEvent) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    return { x, y, pressure };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (tool === "lasso") return;
    const { x, y, pressure } = getCanvasCoords(e);
    isDrawingRef.current = true;

    // Calculate anchored line index (1-based)
    const headerOffsetPx = 48; // approximate header height
    const anchorLine = Math.max(
      1,
      Math.floor((y - headerOffsetPx) / computedLineHeightPx) + 1
    );

    if (tool === "eraser") {
      // Erase nearby strokes
      const remaining = strokes.filter((s) => {
        return !s.points.some(
          (p) => Math.hypot(p.x - x, p.y - y) < size * 4
        );
      });
      setStrokes(remaining);
      onStrokesChange(pageNumber, remaining);
      return;
    }

    const newStroke: Stroke = {
      id: uuid(),
      tool: tool as "pen" | "highlighter",
      color,
      size,
      opacity: tool === "highlighter" ? 0.4 : 1,
      points: [{ x, y, pressure }],
      anchor_line: anchorLine,
      line_offset_y: y - (anchorLine - 1) * computedLineHeightPx,
    };

    currentStrokeRef.current = newStroke;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y, pressure } = getCanvasCoords(e);

    // Hover preview on overlay canvas
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, size / 2), 0, Math.PI * 2);
        ctx.fillStyle = tool === "eraser" ? "rgba(239, 68, 68, 0.4)" : color;
        ctx.fill();
      }
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;

    if (tool === "eraser") {
      const remaining = strokes.filter((s) => {
        return !s.points.some(
          (p) => Math.hypot(p.x - x, p.y - y) < size * 4
        );
      });
      setStrokes(remaining);
      return;
    }

    currentStrokeRef.current.points.push({ x, y, pressure });
    setStrokes((prev) => [...prev.slice(0, -1), currentStrokeRef.current!]);
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentStrokeRef.current) {
      const updated = [...strokes, currentStrokeRef.current];
      setStrokes(updated);
      onStrokesChange(pageNumber, updated);

      // Save to undo history
      const newHistory = history.slice(0, historyIdx + 1);
      newHistory.push(updated);
      setHistory(newHistory);
      setHistoryIdx(newHistory.length - 1);
    }
    currentStrokeRef.current = null;
  };

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <div className={styles.splitLayout}>
        {/* Left Pane: Interactive Code Block */}
        <div className={styles.codePane}>
          <CodeEditorBlock
            code={code}
            language={language}
            lineHeightRatio={lineHeightRatio}
            onCodeChange={handleCodeChangeWithAnchors}
            onLanguageChange={onLanguageChange}
            onLineHeightChange={onLineHeightChange}
            isDrawingMode={tool !== "eraser"}
          />
        </div>

        {/* Right Pane: Ruled Margin Handwriting Lane */}
        <div className={styles.marginPane}>
          <div className={styles.marginHeader}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Line-by-Line Notes & Explanations</span>
          </div>

          <div className={styles.ruledLinesContainer}>
            {lines.map((_, i) => (
              <div
                key={i}
                className={styles.ruledRow}
                style={{ height: `${computedLineHeightPx}px` }}
              >
                <span className={styles.rowAnchorLabel}>L{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transparent Inking Canvas Layers (Overlaid on top of both panes) */}
      <canvas ref={canvasRef} className={styles.mainCanvas} />
      <canvas
        ref={overlayCanvasRef}
        className={styles.overlayCanvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
