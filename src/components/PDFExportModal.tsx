"use client";
import { useState, useEffect } from "react";
import styles from "./PDFExportModal.module.css";

interface Props {
  isOpen: boolean;
  defaultTitle: string;
  onClose: () => void;
  onExport: (options: { filename: string; mode: "replace" | "copy" }) => Promise<void>;
  isExporting: boolean;
  hasOriginalPdf: boolean;
}

export default function PDFExportModal({
  isOpen,
  defaultTitle,
  onClose,
  onExport,
  isExporting,
  hasOriginalPdf,
}: Props) {
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<"replace" | "copy">("copy");

  useEffect(() => {
    if (isOpen) {
      const clean = (defaultTitle || "Untitled_Notebook")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .concat("_annotated");
      setFilename(clean);
      setMode(hasOriginalPdf ? "copy" : "copy");
    }
  }, [isOpen, defaultTitle, hasOriginalPdf]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filename.trim() || isExporting) return;
    await onExport({ filename: filename.trim(), mode });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>
            <span>📄</span>
            <span>Export Annotated PDF</span>
          </h3>
          <button className="btn-icon" onClick={onClose} disabled={isExporting} id="close-modal-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {/* Filename Customization Input */}
            <div>
              <label className={styles.label}>Custom PDF Filename</label>
              <div className={styles.inputGroup} style={{ marginTop: 6 }}>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="Enter custom filename..."
                  className={styles.input}
                  autoFocus
                  required
                  id="pdf-filename-input"
                />
                <span className={styles.extensionBadge}>.pdf</span>
              </div>
            </div>

            {/* Export Options: Replace vs New Copy */}
            <div>
              <label className={styles.label}>Export Destination</label>
              <div className={styles.optionsGrid} style={{ marginTop: 6 }}>
                <div
                  className={`${styles.optionCard} ${mode === "copy" ? styles.selected : ""}`}
                  onClick={() => setMode("copy")}
                  id="opt-save-copy"
                >
                  <div className={styles.optionRadio}>
                    {mode === "copy" && <div className={styles.optionRadioInner} />}
                  </div>
                  <div className={styles.optionText}>
                    <span className={styles.optionTitle}>📑 Save as New Copy (Download)</span>
                    <span className={styles.optionDesc}>
                      Keep the original lecture slides untouched and generate a separate downloadable annotated PDF.
                    </span>
                  </div>
                </div>

                {hasOriginalPdf && (
                  <div
                    className={`${styles.optionCard} ${mode === "replace" ? styles.selected : ""}`}
                    onClick={() => setMode("replace")}
                    id="opt-replace-orig"
                  >
                    <div className={styles.optionRadio}>
                      {mode === "replace" && <div className={styles.optionRadioInner} />}
                    </div>
                    <div className={styles.optionText}>
                      <span className={styles.optionTitle}>🔄 Replace Original in Notebook</span>
                      <span className={styles.optionDesc}>
                        Permanently update this notebook's cloud slide deck with your new vector handwriting strokes baked in.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isExporting || !filename.trim()}
              id="confirm-pdf-export-btn"
            >
              {isExporting ? (
                <>
                  <div className="spinner" style={{ width: 12, height: 12 }} />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <span>Export PDF</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
