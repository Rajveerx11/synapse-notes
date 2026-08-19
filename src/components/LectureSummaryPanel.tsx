"use client";
import { useState, useCallback } from "react";
import { LectureSummary } from "@/lib/types";
import styles from "./LectureSummaryPanel.module.css";

interface Props {
  notebookId: string;
  pageNumber: number;
  ocrText?: string;
  onSaveCard?: (title: string, content: string) => void;
}

export default function LectureSummaryPanel({
  notebookId,
  pageNumber,
  ocrText = "",
  onSaveCard,
}: Props) {
  const [summary, setSummary] = useState<LectureSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedCards, setSavedCards] = useState<Set<string>>(new Set());

  const handleSummarize = useCallback(async () => {
    if (!ocrText.trim()) {
      setError("Run OCR on this page first to extract text.");
      return;
    }
    setLoading(true);
    setError("");
    setSummary(null);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_number: pageNumber, ocr_text: ocrText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Summarization failed");
      setSummary(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [notebookId, pageNumber, ocrText]);

  const saveConceptAsCard = useCallback(
    async (concept: string) => {
      if (!summary) return;
      const title = concept;
      const content = summary.definitions[concept] || `Key concept from "${summary.title}"`;
      onSaveCard?.(title, content);
      setSavedCards((prev) => new Set([...prev, concept]));
    },
    [summary, onSaveCard]
  );

  const saveAllQuestionsAsCard = useCallback(async () => {
    if (!summary) return;
    const content = summary.follow_up_questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    onSaveCard?.(`Study Questions — ${summary.title}`, content);
  }, [summary, onSaveCard]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>✨</span>
        <span className={styles.headerTitle}>AI Lecture Summary</span>
        <span className={styles.pageLabel}>Page {pageNumber}</span>
      </div>

      {!ocrText.trim() && (
        <p className={styles.hint}>
          Run <strong>OCR</strong> on this page first, then come back to summarize.
        </p>
      )}

      <button
        className={styles.summarizeBtn}
        onClick={handleSummarize}
        disabled={loading || !ocrText.trim()}
        aria-label="Generate AI summary"
      >
        {loading ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          "Summarize Page"
        )}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {summary && (
        <div className={styles.results}>
          <h3 className={styles.summaryTitle}>{summary.title}</h3>

          {summary.key_concepts.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionHeading}>Key Concepts</h4>
              <ul className={styles.conceptList}>
                {summary.key_concepts.map((c) => (
                  <li key={c} className={styles.conceptItem}>
                    <span className={styles.conceptBadge}>{c}</span>
                    <button
                      className={styles.saveBtn}
                      onClick={() => saveConceptAsCard(c)}
                      disabled={savedCards.has(c)}
                      aria-label={`Save "${c}" as flashcard`}
                    >
                      {savedCards.has(c) ? "✓ Saved" : "+ Card"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Object.keys(summary.definitions).length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionHeading}>Definitions</h4>
              <dl className={styles.defList}>
                {Object.entries(summary.definitions).map(([term, def]) => (
                  <div key={term} className={styles.defEntry}>
                    <dt className={styles.defTerm}>{term}</dt>
                    <dd className={styles.defDesc}>{def}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {summary.follow_up_questions.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionHeading}>
                Study Questions
                <button
                  className={styles.saveAllBtn}
                  onClick={saveAllQuestionsAsCard}
                  aria-label="Save all questions as a flashcard"
                >
                  Save All as Card
                </button>
              </h4>
              <ol className={styles.questionList}>
                {summary.follow_up_questions.map((q, i) => (
                  <li key={i} className={styles.questionItem}>
                    {q}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className={styles.meta}>
            Generated with <code>{summary.model_used}</code>
          </p>
        </div>
      )}
    </div>
  );
}
