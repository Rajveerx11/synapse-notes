"use client";
/**
 * InfiniteCanvas — virtualized multi-page canvas scroll wrapper.
 *
 * Renders pages in a vertical strip. Only ±1 page beyond the visible viewport
 * is mounted (virtual window = 3 pages max), keeping memory low even for
 * very long notebooks. Snap-scrolling lands precisely on page boundaries.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import Canvas from "./Canvas";
import { Stroke, Page } from "@/lib/types";
import styles from "./InfiniteCanvas.module.css";

const PAGE_GAP_PX = 24; // vertical gap between page surfaces

interface Props {
  notebookId: string;
  pages: Page[];
  currentPage: number;
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  color: string;
  size: number;
  onStrokesChange: (pageNumber: number, strokes: Stroke[]) => void;
  onPageChange: (page: number) => void;
  onAddPage: () => void;
}

export default function InfiniteCanvas({
  notebookId,
  pages,
  currentPage,
  tool,
  color,
  size,
  onStrokesChange,
  onPageChange,
  onAddPage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pageHeight, setPageHeight] = useState(0);

  // Measure a single page height on mount/resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      // A4 aspect ratio (297/210 ≈ 1.414) relative to container width
      const w = el.clientWidth - 48; // 24px side padding each side
      setPageHeight(Math.round(w * 1.414));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll to currentPage whenever it changes externally
  useEffect(() => {
    if (!scrollRef.current || pageHeight === 0) return;
    const idx = currentPage - 1;
    const top = idx * (pageHeight + PAGE_GAP_PX);
    scrollRef.current.scrollTo({ top, behavior: "smooth" });
  }, [currentPage, pageHeight]);

  // Update currentPage based on scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageHeight === 0) return;
    const stride = pageHeight + PAGE_GAP_PX;
    const centerY = el.scrollTop + el.clientHeight / 2;
    const idx = Math.round((centerY - pageHeight / 2) / stride);
    const newPage = Math.max(1, Math.min(pages.length, idx + 1));
    onPageChange(newPage);
  }, [pageHeight, pages.length, onPageChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Virtualization: only render pages within ±1 of current
  function isVisible(pageNum: number) {
    return Math.abs(pageNum - currentPage) <= 1;
  }

  const totalHeight = pages.length * pageHeight + (pages.length - 1) * PAGE_GAP_PX;

  return (
    <div className={styles.wrapper}>
      <div className={styles.scrollArea} ref={scrollRef}>
        <div className={styles.strip} style={{ height: totalHeight }}>
          {pages.map((page, idx) => {
            const top = idx * (pageHeight + PAGE_GAP_PX);
            const strokes: Stroke[] = page.strokes_json
              ? JSON.parse(page.strokes_json)
              : [];

            return (
              <div
                key={page.page_number}
                className={styles.pageSlot}
                ref={el => { pageRefs.current[idx] = el; }}
                style={{ top, height: pageHeight }}
              >
                {/* Page label */}
                <div className={styles.pageLabel}>Page {page.page_number}</div>

                {/* Canvas — only mounted when near viewport */}
                {isVisible(page.page_number) ? (
                  <div className={styles.canvasWrap}>
                    <Canvas
                      key={`inf-canvas-${page.page_number}`}
                      notebookId={notebookId}
                      pageNumber={page.page_number}
                      tool={tool}
                      color={color}
                      size={size}
                      initialStrokes={strokes}
                      onStrokesChange={onStrokesChange}
                    />
                  </div>
                ) : (
                  /* Placeholder keeps layout stable while page is off-screen */
                  <div className={styles.pagePlaceholder} aria-hidden="true">
                    <span className={styles.placeholderText}>
                      {strokes.length} stroke{strokes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add page button — fixed at bottom */}
      <button
        className={styles.addPageBtn}
        onClick={onAddPage}
        aria-label="Add new page"
        title="Add new page (↓)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New Page
      </button>

      {/* Page indicator */}
      <div className={styles.pageIndicator} aria-live="polite">
        {currentPage} / {pages.length}
      </div>
    </div>
  );
}
