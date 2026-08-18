"use client";
import { useState, useCallback } from "react";
import { ocrCanvas, OcrProgress, OcrResult } from "@/lib/ocr";
import styles from "./OcrPanel.module.css";

interface Props {
  notebookId: string;
  pageNumber: number;
  onSaveText: (text: string) => void;
  onClose: () => void;
}

export default function OcrPanel({ notebookId, pageNumber, onSaveText, onClose }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState<OcrProgress>({ status: "", progress: 0 });
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const runOcr = useCallback(async () => {
    setPhase("running");
    setResult(null);
    setError("");
    setSaved(false);

    try {
      const res = await ocrCanvas((p) => setProgress(p));
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed");
      setPhase("error");
    }
  }, []);

  const copyText = useCallback(async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const saveAsNote = useCallback(async () => {
    if (!result?.text) return;
    setSaving(true);
    try {
      // Persist OCR text to DB via the pages API
      await fetch(`/api/notebooks/${notebookId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_number: pageNumber,
          text_content: result.text,
        }),
      });
      onSaveText(result.text);
      setSaved(true);
    } catch (e) {
      console.error("Failed to save OCR text:", e);
    } finally {
      setSaving(false);
    }
  }, [result, notebookId, pageNumber, onSaveText]);

  const confidenceColor =
    (result?.confidence ?? 0) >= 75 ? "var(--success)" :
    (result?.confidence ?? 0) >= 40 ? "var(--warning)" :
                                       "var(--error)";

  return (
    <aside className={styles.panel} role="complementary" aria-label="OCR text recognition">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          <span>Ink OCR</span>
          <span className={styles.pageBadge}>Page {pageNumber}</span>
        </div>
        <button className="btn-icon" onClick={onClose} id="ocr-close-btn" title="Close OCR panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scan button */}
      {phase === "idle" && (
        <div className={styles.idleState}>
          <div className={styles.idleIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <p className={styles.idleHint}>Scan the handwriting on this page and convert it to searchable text.</p>
          <button className={`btn btn-primary ${styles.scanBtn}`} onClick={runOcr} id="ocr-scan-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Scan Page
          </button>
        </div>
      )}

      {/* Progress */}
      {phase === "running" && (
        <div className={styles.progressState}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
          <p className={styles.progressLabel}>
            {progress.status || "Initializing…"} — {Math.round(progress.progress * 100)}%
          </p>
          <p className={styles.progressHint}>First scan downloads the language model (~10 MB). Subsequent scans are instant.</p>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className={styles.errorState}>
          <p className={styles.errorMsg}>{error}</p>
          <button className="btn btn-ghost" onClick={runOcr} id="ocr-retry-btn">Retry</button>
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <div className={styles.results}>
          {/* Confidence badge */}
          <div className={styles.confidenceRow}>
            <span className={styles.confidenceLabel}>Confidence</span>
            <span className={styles.confidenceBadge} style={{ color: confidenceColor, borderColor: confidenceColor }}>
              {result.confidence}%
            </span>
            <button className="btn btn-ghost" onClick={runOcr} id="ocr-rescan-btn" style={{ marginLeft: "auto", fontSize: "11px", padding: "3px 8px" }}>
              Re-scan
            </button>
          </div>

          {/* Per-line results */}
          {result.lines.length > 0 ? (
            <div className={styles.linesList}>
              {result.lines.map((line, i) => (
                <div key={i} className={styles.lineItem}>
                  <span className={styles.lineText}>{line.text}</span>
                  <span
                    className={styles.lineConf}
                    style={{
                      color: line.confidence >= 75 ? "var(--success)" :
                             line.confidence >= 40 ? "var(--warning)" : "var(--text-muted)"
                    }}
                  >
                    {line.confidence}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noText}>No text detected. Try a cleaner ink stroke or different paper background.</p>
          )}

          {/* Full text textarea (editable) */}
          {result.text && (
            <textarea
              className={styles.textArea}
              defaultValue={result.text}
              rows={5}
              id="ocr-text-output"
              aria-label="Recognized text (editable)"
              onChange={(e) => {
                // Update in-memory result so copy/save use the edited text
                result.text = e.target.value;
              }}
            />
          )}

          {/* Actions */}
          {result.text && (
            <div className={styles.actions}>
              <button
                className="btn btn-ghost"
                onClick={copyText}
                id="ocr-copy-btn"
                style={{ flex: 1 }}
              >
                {copied ? "✓ Copied!" : "Copy Text"}
              </button>
              <button
                className="btn btn-primary"
                onClick={saveAsNote}
                disabled={saving || saved}
                id="ocr-save-btn"
                style={{ flex: 1 }}
              >
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save as Note"}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
