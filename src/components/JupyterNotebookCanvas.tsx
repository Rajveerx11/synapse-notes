"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stroke } from "@/lib/types";
import {
  JupyterCell,
  JupyterCellOutput,
  parseIpynb,
  serializeToIpynb,
  parsePythonScript,
  serializeToPythonScript,
} from "@/lib/ipynbParser";
import {
  executePythonCode,
  resetPythonKernel,
  subscribePyodideStatus,
  PyodideStatus,
} from "@/lib/pyodideRunner";
import { v4 as uuid } from "uuid";
import styles from "./JupyterNotebookCanvas.module.css";

interface Props {
  notebookId: string;
  pageNumber: number;
  rawContent: string;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  initialStrokes: Stroke[];
  onContentChange: (serialized: string) => void;
  onStrokesChange: (pageNumber: number, strokes: Stroke[]) => void;
  isDrawingActive?: boolean;
}

const DEFAULT_CELLS: JupyterCell[] = [
  {
    id: "cell_intro",
    type: "markdown",
    source: "# 🧠 Synapse Interactive Machine Learning Notebook\n\nWelcome! You can write **Markdown**, math formulas like $f(x) = \\sigma(W^T x + b)$, run **Python** in the browser with Pyodide, and handwrite notes directly over your code using the stylus/pen toolbar.",
    execution_count: null,
  },
  {
    id: "cell_demo_py",
    type: "code",
    source: "# Compute simple forward pass or matrix multiplication\nimport math\n\ndef sigmoid(z):\n    return 1 / (1 + math.exp(-z))\n\nweights = [0.5, -0.2, 0.1]\ninputs  = [1.0, 2.0, 0.5]\nbias = 0.1\n\nz = sum(w * x for w, x in zip(weights, inputs)) + bias\nactivation = sigmoid(z)\n\nprint(f\"Linear dot product z: {z:.4f}\")\nprint(f\"Sigmoid output: {activation:.4f}\")",
    execution_count: 1,
    outputs: [
      {
        type: "text",
        text: "Linear dot product z: 0.2500\nSigmoid output: 0.5622",
      },
    ],
  },
];

// Helper: Point to segment squared distance
function distToSegmentSquared(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
}

function isStrokeNear(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r2 = radius * radius;
  const pts = stroke.points;
  if (!pts || pts.length === 0) return false;
  if (pts.length === 1) {
    return (pts[0].x - x) ** 2 + (pts[0].y - y) ** 2 <= r2;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegmentSquared(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= r2) {
      return true;
    }
  }
  return false;
}

export default function JupyterNotebookCanvas({
  pageNumber,
  rawContent,
  tool,
  color,
  size,
  initialStrokes,
  onContentChange,
  onStrokesChange,
  isDrawingActive = false,
}: Props) {
  // ── Cell State ────────────────────────────────────────────────────────
  const [cells, setCells] = useState<JupyterCell[]>(() => {
    if (!rawContent || !rawContent.trim()) {
      return DEFAULT_CELLS;
    }
    const trimmed = rawContent.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"cells"')) {
      return parseIpynb(trimmed);
    } else if (trimmed.startsWith("# %%") || trimmed.startsWith("#!/usr/bin/env python")) {
      return parsePythonScript(trimmed);
    } else {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Raw python text
      }
      return [
        {
          id: `cell_${uuid().slice(0, 8)}`,
          type: "code",
          source: rawContent,
          execution_count: null,
        },
      ];
    }
  });

  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [pyodideStatus, setPyodideStatus] = useState<PyodideStatus>("idle");
  const [isDragOver, setIsDragOver] = useState(false);

  // ── References ────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const notebookBodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Ensure initial scroll position starts at top
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  // Pyodide status subscription
  useEffect(() => {
    return subscribePyodideStatus(status => setPyodideStatus(status));
  }, []);

  // Sync strokes from parent
  useEffect(() => {
    setStrokes(initialStrokes);
  }, [initialStrokes]);

  // Notify parent on cells change
  const handleCellsUpdated = useCallback((newCells: JupyterCell[]) => {
    setCells(newCells);
    const serialized = serializeToIpynb(newCells);
    onContentChange(serialized);
  }, [onContentChange]);

  // ── Canvas Sizing & Redraw ───────────────────────────────────────────
  const resizeCanvases = useCallback(() => {
    if (!notebookBodyRef.current || !canvasRef.current || !overlayCanvasRef.current) return;
    const body = notebookBodyRef.current;
    const width = body.offsetWidth || 960;
    const height = Math.max(body.scrollHeight || 600, 800);
    const dpr = window.devicePixelRatio || 1;

    const mainCanvas = canvasRef.current;
    const overCanvas = overlayCanvasRef.current;

    if (mainCanvas.width !== width * dpr || mainCanvas.height !== height * dpr) {
      mainCanvas.width = width * dpr;
      mainCanvas.height = height * dpr;
      mainCanvas.style.width = `${width}px`;
      mainCanvas.style.height = `${height}px`;
      const ctx = mainCanvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (overCanvas.width !== width * dpr || overCanvas.height !== height * dpr) {
      overCanvas.width = width * dpr;
      overCanvas.height = height * dpr;
      overCanvas.style.width = `${width}px`;
      overCanvas.style.height = `${height}px`;
      const octx = overCanvas.getContext("2d");
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : stroke.opacity || 1;

      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

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
  }, [strokes]);

  useEffect(() => {
    resizeCanvases();
    redrawCanvas();
  }, [cells, resizeCanvases, redrawCanvas]);

  // Window & body resize observer
  useEffect(() => {
    if (!notebookBodyRef.current) return;
    const observer = new ResizeObserver(() => {
      resizeCanvases();
      redrawCanvas();
    });
    observer.observe(notebookBodyRef.current);
    return () => observer.disconnect();
  }, [resizeCanvases, redrawCanvas]);

  // ── Accurate Coordinates Calculation ─────────────────────────────────
  const getCanvasCoords = (e: React.PointerEvent) => {
    const canvas = overlayCanvasRef.current || canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // ── Eraser Helper ────────────────────────────────────────────────────
  const eraseStrokesAt = (x: number, y: number) => {
    const eraseRadius = Math.max(18, size * 6);
    setStrokes(prevStrokes => {
      const remaining = prevStrokes.filter(s => !isStrokeNear(s, x, y, eraseRadius));
      if (remaining.length !== prevStrokes.length) {
        onStrokesChange(pageNumber, remaining);
      }
      return remaining;
    });
  };

  // ── Drawing Event Handlers ───────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingActive && tool !== "pen" && tool !== "highlighter" && tool !== "eraser") return;
    const coords = getCanvasCoords(e);
    isDrawingRef.current = true;

    if (tool === "eraser") {
      eraseStrokesAt(coords.x, coords.y);
      return;
    }

    const newStroke: Stroke = {
      id: uuid(),
      tool: tool as "pen" | "highlighter" | "eraser",
      color,
      size,
      opacity: tool === "highlighter" ? 0.35 : 1,
      points: [{ x: coords.x, y: coords.y, pressure: e.pressure || 0.5 }],
    };
    currentStrokeRef.current = newStroke;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const coords = getCanvasCoords(e);

    if (tool === "eraser") {
      if (isDrawingRef.current) {
        eraseStrokesAt(coords.x, coords.y);
      }

      // Live Eraser Circle Hover Preview
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);
          ctx.save();
          ctx.strokeStyle = "#ef4444";
          ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(coords.x, coords.y, Math.max(18, size * 6), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
      return;
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    currentStrokeRef.current.points.push({
      x: coords.x,
      y: coords.y,
      pressure: e.pressure || 0.5,
    });

    // Draw live stroke on overlay canvas
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);

    const pts = currentStrokeRef.current.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = currentStrokeRef.current.color;
    ctx.lineWidth = currentStrokeRef.current.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = currentStrokeRef.current.opacity;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;

    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width / dpr, overlayCanvasRef.current.height / dpr);
    }

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const updated = [...strokes, currentStrokeRef.current];
      setStrokes(updated);
      onStrokesChange(pageNumber, updated);
      currentStrokeRef.current = null;
    }
  };

  // ── Cell Operations ──────────────────────────────────────────────────
  const handleAddCell = (type: "code" | "markdown", afterId?: string) => {
    const newCell: JupyterCell = {
      id: `cell_${uuid().slice(0, 8)}`,
      type,
      source: type === "code" ? "# Python code\n" : "### New Section\nWrite notes here...",
      execution_count: null,
      isEditing: false,
    };

    if (!afterId) {
      handleCellsUpdated([...cells, newCell]);
      return;
    }

    const idx = cells.findIndex(c => c.id === afterId);
    if (idx === -1) {
      handleCellsUpdated([...cells, newCell]);
    } else {
      const copy = [...cells];
      copy.splice(idx + 1, 0, newCell);
      handleCellsUpdated(copy);
    }
  };

  const handleDeleteCell = (id: string) => {
    if (cells.length <= 1) {
      handleCellsUpdated([
        {
          id: `cell_${uuid().slice(0, 8)}`,
          type: "code",
          source: "",
          execution_count: null,
        },
      ]);
      return;
    }
    handleCellsUpdated(cells.filter(c => c.id !== id));
  };

  const handleMoveCell = (id: string, direction: "up" | "down") => {
    const idx = cells.findIndex(c => c.id === id);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === cells.length - 1) return;

    const copy = [...cells];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    handleCellsUpdated(copy);
  };

  const handleCellSourceChange = (id: string, newSource: string) => {
    const updated = cells.map(c => (c.id === id ? { ...c, source: newSource } : c));
    handleCellsUpdated(updated);
  };

  const handleRunCell = async (id: string) => {
    const cell = cells.find(c => c.id === id);
    if (!cell || cell.type !== "code") return;

    setRunningCellId(id);
    try {
      const res = await executePythonCode(cell.source);
      const outputs: JupyterCellOutput[] = [];

      if (res.stdout) {
        outputs.push({ type: "text", text: res.stdout });
      }
      if (res.stderr) {
        outputs.push({ type: "text", text: `[stderr]\n${res.stderr}` });
      }
      if (res.error) {
        outputs.push({ type: "error", text: res.error });
      }
      for (const img of res.images) {
        outputs.push({ type: "image", imageData: img });
      }

      const nextExecCount = (cell.execution_count || 0) + 1;
      const updated = cells.map(c =>
        c.id === id
          ? {
              ...c,
              execution_count: nextExecCount,
              outputs: outputs.length > 0 ? outputs : undefined,
            }
          : c
      );
      handleCellsUpdated(updated);
    } catch (err: any) {
      const updated = cells.map(c =>
        c.id === id
          ? {
              ...c,
              outputs: [{ type: "error" as const, text: err?.message || String(err) }],
            }
          : c
      );
      handleCellsUpdated(updated);
    } finally {
      setRunningCellId(null);
    }
  };

  const handleRunAllCells = async () => {
    for (const cell of cells) {
      if (cell.type === "code") {
        await handleRunCell(cell.id);
      }
    }
  };

  const handleClearOutputs = () => {
    const updated = cells.map(c => ({
      ...c,
      execution_count: null,
      outputs: undefined,
    }));
    handleCellsUpdated(updated);
  };

  const handleRestartKernel = async () => {
    try {
      await resetPythonKernel();
      handleClearOutputs();
    } catch (err) {
      console.warn("Kernel restart error:", err);
    }
  };

  // ── Import File Handler ──────────────────────────────────────────────
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      if (!content) return;

      if (file.name.endsWith(".ipynb") || content.trim().startsWith("{")) {
        const loaded = parseIpynb(content);
        handleCellsUpdated(loaded);
      } else {
        const loaded = parsePythonScript(content);
        handleCellsUpdated(loaded);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImportFile(e.dataTransfer.files[0]);
    }
  };

  const isEraser = tool === "eraser";

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isDragOver ? styles.dropOverlay : ""}`}
      onDragOver={e => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Action Toolbar */}
      <div className={styles.actionBar}>
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => handleAddCell("code", activeCellId || undefined)}
            title="Add new Python Code Cell"
          >
            + Code
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => handleAddCell("markdown", activeCellId || undefined)}
            title="Add new Markdown / Text Cell"
          >
            + Text
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleRunAllCells}
            disabled={runningCellId !== null}
            title="Execute all code cells in sequence"
          >
            ▶ Run All
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleRestartKernel}
            title="Reset Python environment variables and clear outputs"
          >
            ⟳ Restart Kernel
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleClearOutputs}
            title="Clear all cell outputs"
          >
            Clear Outputs
          </button>
        </div>

        <div className={styles.actionGroup}>
          {/* File Upload Input */}
          <label className={styles.actionBtn} style={{ cursor: "pointer" }}>
            📂 Import .ipynb / .py
            <input
              type="file"
              accept=".ipynb,.py,.txt"
              style={{ display: "none" }}
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImportFile(e.target.files[0]);
                }
              }}
            />
          </label>

          {/* Pyodide WASM Status Indicator */}
          <div
            className={`${styles.statusChip} ${
              pyodideStatus === "ready"
                ? styles.statusReady
                : pyodideStatus === "loading"
                ? styles.statusLoading
                : pyodideStatus === "error"
                ? styles.statusError
                : styles.statusIdle
            }`}
          >
            <span className={styles.statusDot} />
            <span>
              {pyodideStatus === "ready"
                ? "Python WASM: Ready"
                : pyodideStatus === "loading"
                ? "Loading Pyodide..."
                : pyodideStatus === "error"
                ? "Pyodide Error"
                : "Python WASM: Standby"}
            </span>
          </div>
        </div>
      </div>

      {/* Cells List & Drawing Canvas Overlay */}
      <div ref={notebookBodyRef} className={styles.notebookBody}>
        {/* Layer 1: Inking Canvases */}
        <canvas ref={canvasRef} className={styles.canvasOverlay} />
        <canvas
          ref={overlayCanvasRef}
          className={`${styles.canvasOverlay} ${
            isDrawingActive ? (isEraser ? styles.canvasOverlayEraser : styles.canvasOverlayInteractive) : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        {/* Layer 0: Cell Elements */}
        {cells.map((cell, idx) => (
          <div
            key={cell.id}
            className={`${styles.cellWrapper} ${activeCellId === cell.id ? styles.cellFocused : ""}`}
            onClick={() => setActiveCellId(cell.id)}
          >
            {/* Cell Header & Controls */}
            <div className={styles.cellHeader}>
              <div className={styles.cellMeta}>
                {cell.type === "code" && (
                  <span className={styles.execCount}>
                    [{runningCellId === cell.id ? <span className={styles.spinner} /> : cell.execution_count ? cell.execution_count : " "}]
                  </span>
                )}
                <span className={styles.cellTypeTag}>{cell.type}</span>
              </div>

              <div className={styles.cellControls}>
                {cell.type === "code" && (
                  <button
                    type="button"
                    className={`${styles.cellBtn} ${styles.cellBtnRun}`}
                    onClick={() => handleRunCell(cell.id)}
                    disabled={runningCellId !== null}
                    title="Run Cell (Shift+Enter)"
                  >
                    ▶ Run
                  </button>
                )}
                <button
                  type="button"
                  className={styles.cellBtn}
                  onClick={() => handleMoveCell(cell.id, "up")}
                  disabled={idx === 0}
                  title="Move cell up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.cellBtn}
                  onClick={() => handleMoveCell(cell.id, "down")}
                  disabled={idx === cells.length - 1}
                  title="Move cell down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${styles.cellBtn} ${styles.cellBtnDelete}`}
                  onClick={() => handleDeleteCell(cell.id)}
                  title="Delete cell"
                >
                  🗑
                </button>
              </div>
            </div>

            {/* Cell Editor / Rendered Body */}
            {cell.type === "code" ? (
              <div className={styles.editorArea}>
                <textarea
                  className={styles.codeTextarea}
                  value={cell.source}
                  onChange={e => handleCellSourceChange(cell.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleRunCell(cell.id);
                    } else if (e.key === "Tab") {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const val = target.value;
                      const nextVal = val.substring(0, start) + "    " + val.substring(end);
                      handleCellSourceChange(cell.id, nextVal);
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 4;
                      }, 0);
                    }
                  }}
                  rows={Math.max(2, cell.source.split("\n").length)}
                  placeholder="# Write Python code here..."
                  spellCheck={false}
                />
              </div>
            ) : (
              <MarkdownCellRenderer
                cell={cell}
                onUpdate={newSource => handleCellSourceChange(cell.id, newSource)}
              />
            )}

            {/* Outputs */}
            {cell.type === "code" && cell.outputs && cell.outputs.length > 0 && (
              <div className={styles.outputContainer}>
                {cell.outputs.map((out, oIdx) => (
                  <React.Fragment key={oIdx}>
                    {out.type === "text" && <pre className={styles.outputText}>{out.text}</pre>}
                    {out.type === "error" && <pre className={styles.outputError}>{out.text}</pre>}
                    {out.type === "image" && out.imageData && (
                      <img
                        src={out.imageData}
                        alt="Plot output"
                        className={styles.outputImage}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}

        {cells.length === 0 && (
          <div className={styles.emptyState}>
            <p>No cells in this notebook. Click "+ Code" or "+ Text" above or drag and drop a .ipynb file.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Markdown Cell Component with KaTeX Math Rendering ──────────────────
function MarkdownCellRenderer({
  cell,
  onUpdate,
}: {
  cell: JupyterCell;
  onUpdate: (newSource: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      return;
    }
    if (!previewRef.current) return;
    const el = previewRef.current;

    async function renderContent() {
      try {
        const katex = (await import("katex")).default;
        await import("katex/dist/katex.min.css" as never);

        // Simple Markdown parsing: bold, italic, headings, math
        let parsed = cell.source
          // Escape HTML tags to prevent XSS
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          // Math blocks $$...$$
          .replace(/\$\$([^$]+)\$\$/g, (_, math) => {
            try {
              return katex.renderToString(math, { displayMode: true, throwOnError: false });
            } catch {
              return _;
            }
          })
          // Inline math $...$
          .replace(/\$([^$\n]+)\$/g, (_, math) => {
            try {
              return katex.renderToString(math, { displayMode: false, throwOnError: false });
            } catch {
              return _;
            }
          })
          // Headings
          .replace(/^### (.*$)/gim, '<h3 style="margin: 8px 0 4px 0; font-size: 1.15em;">$1</h3>')
          .replace(/^## (.*$)/gim, '<h2 style="margin: 12px 0 6px 0; font-size: 1.35em;">$1</h2>')
          .replace(/^# (.*$)/gim, '<h1 style="margin: 14px 0 8px 0; font-size: 1.6em;">$1</h1>')
          // Bold & Italic
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\*([^*]+)\*/g, "<em>$1</em>")
          // Line breaks
          .replace(/\n/g, "<br/>");

        el.innerHTML = parsed;
      } catch {
        if (el) el.innerText = cell.source;
      }
    }

    renderContent();
  }, [cell.source, isEditing]);

  if (isEditing) {
    return (
      <div style={{ padding: "8px 12px" }}>
        <textarea
          ref={textareaRef}
          className={styles.markdownEditor}
          value={cell.source}
          onChange={e => onUpdate(e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) {
              e.preventDefault();
              setIsEditing(false);
            }
          }}
          rows={Math.max(3, cell.source.split("\n").length)}
          placeholder="Write Markdown or LaTeX ($...$ / $$...$$)..."
        />
        <div className={styles.markdownHint}>Press Shift+Enter or click outside to finish editing</div>
      </div>
    );
  }

  return (
    <div
      ref={previewRef}
      className={styles.markdownPreview}
      onDoubleClick={() => setIsEditing(true)}
      title="Double click to edit Markdown"
    />
  );
}
