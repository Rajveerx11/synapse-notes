"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./PDFViewer.module.css";

interface Props {
  url: string;
  onClose: () => void;
  onAnnotate: () => void;
}

export default function PDFViewer({ url, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPDF() {
      setLoading(true);
      setError("");
      try {
        // Dynamically import pdfjs to avoid SSR issues
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
        renderPage(pdf, 1);
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load PDF. Please try again.");
          setLoading(false);
        }
      }
    }

    loadPDF();
    return () => { cancelled = true; };
  }, [url]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderPage(pdf: any, pageNum: number) {
    if (!canvasRef.current) return;

    // Cancel previous render
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }

    const page = await pdf.getPage(pageNum);
    const container = containerRef.current!;
    const containerWidth = container.clientWidth - 32;
    const viewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width = `${scaledViewport.width}px`;
    canvas.style.height = `${scaledViewport.height}px`;

    const task = page.render({ canvasContext: ctx, viewport: scaledViewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      // Render cancelled — expected during rapid page nav
    }
  }

  async function goToPage(p: number) {
    if (!pdfDocRef.current || p < 1 || p > numPages) return;
    setCurrentPage(p);
    await renderPage(pdfDocRef.current, p);
  }

  return (
    <div className={styles.viewer} ref={containerRef}>
      <div className={styles.controls}>
        <button
          className="btn-icon"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          id="pdf-prev"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className={styles.pageInfo}>
          {loading ? "Loading…" : `${currentPage} / ${numPages}`}
        </span>
        <button
          className="btn-icon"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          id="pdf-next"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <button className="btn btn-ghost" onClick={onClose} id="pdf-close" style={{ marginLeft: "auto" }}>
          Close PDF
        </button>
      </div>

      <div className={styles.canvasWrap}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading PDF…</p>
          </div>
        )}
        {error && <p className={styles.errorMsg}>{error}</p>}
        <canvas ref={canvasRef} className={styles.pdfCanvas} />
      </div>
    </div>
  );
}
