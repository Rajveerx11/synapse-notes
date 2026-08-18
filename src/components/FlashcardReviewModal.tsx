"use client";
import { useState, useEffect, useCallback } from "react";
import { AiCard } from "@/lib/types";
import { RecallRating } from "@/lib/srs";
import styles from "./FlashcardReviewModal.module.css";

interface Props {
  notebookId?: string;
  notebookTitle?: string;
  onClose: () => void;
}

export default function FlashcardReviewModal({ notebookId, notebookTitle, onClose }: Props) {
  const [cards, setCards] = useState<AiCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
  });

  // Fetch due cards
  const loadCards = useCallback(async (fetchAll = false) => {
    setLoading(true);
    try {
      const url = fetchAll
        ? `/api/notebooks/${notebookId}/cards`
        : `/api/cards/review${notebookId ? `?notebookId=${notebookId}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok && json.data) {
        setCards(json.data);
        setCurrentIndex(0);
        setIsFlipped(false);
        setIsCompleted(false);
      }
    } catch (e) {
      console.error("Failed to load review cards:", e);
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const currentCard = cards[currentIndex];

  const handleRate = async (rating: RecallRating) => {
    if (!currentCard || submitting) return;
    setSubmitting(true);

    // Update stats
    setSessionStats(prev => ({
      ...prev,
      total: prev.total + 1,
      againCount: rating === "again" ? prev.againCount + 1 : prev.againCount,
      hardCount: rating === "hard" ? prev.hardCount + 1 : prev.hardCount,
      goodCount: rating === "good" ? prev.goodCount + 1 : prev.goodCount,
      easyCount: rating === "easy" ? prev.easyCount + 1 : prev.easyCount,
    }));

    try {
      await fetch("/api/cards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: currentCard.id, rating }),
      });
    } catch (e) {
      console.warn("Review rating sync warning:", e);
    } finally {
      setSubmitting(false);
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex(i => i + 1);
        setIsFlipped(false);
      } else {
        setIsCompleted(true);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!isCompleted && cards.length > 0) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setIsFlipped(f => !f);
        } else if (isFlipped && !submitting) {
          if (e.key === "1") handleRate("again");
          else if (e.key === "2") handleRate("hard");
          else if (e.key === "3") handleRate("good");
          else if (e.key === "4") handleRate("easy");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted, isFlipped, cards.length, submitting]);

  const accuracy = sessionStats.total > 0
    ? Math.round(((sessionStats.goodCount + sessionStats.easyCount) / sessionStats.total) * 100)
    : 100;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Flashcard Review">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>Spaced Repetition (SM-2)</span>
            <h3 className={styles.title}>{notebookTitle ? `${notebookTitle} — Review` : "Flashcard Review"}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} id="close-review-btn" aria-label="Close review modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Progress Bar */}
        {cards.length > 0 && !isCompleted && (
          <div className={styles.progressBarWrapper}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round(((currentIndex + 1) / cards.length) * 100)}%` }}
              />
            </div>
            <div className={styles.progressText}>
              <span>Card {currentIndex + 1} of {cards.length}</span>
              <span>{Math.round(((currentIndex + 1) / cards.length) * 100)}% complete</span>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className={styles.centerState}>
            <div className={styles.spinner} />
            <p>Loading study flashcards…</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && cards.length === 0 && (
          <div className={styles.centerState}>
            <div className={styles.emptyIcon}>🎉</div>
            <h4>All caught up!</h4>
            <p>No study cards are due for review right now. Great job keeping up with your active recall practice!</p>
            <div className={styles.emptyActions}>
              <button className="btn btn-primary" onClick={() => loadCards(true)} id="review-all-btn">
                Review All Cards Anyway
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Completed State */}
        {!loading && isCompleted && (
          <div className={styles.completedState}>
            <div className={styles.celebrationIcon}>🏆</div>
            <h3>Session Complete!</h3>
            <p className={styles.completedSubtitle}>You&apos;ve completed all due cards for this study session.</p>

            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{sessionStats.total}</span>
                <span className={styles.statLabel}>Cards Studied</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: "var(--success)" }}>{accuracy}%</span>
                <span className={styles.statLabel}>Accuracy</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: "var(--accent)" }}>{sessionStats.easyCount + sessionStats.goodCount}</span>
                <span className={styles.statLabel}>Recalled</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: "var(--error)" }}>{sessionStats.againCount}</span>
                <span className={styles.statLabel}>To Repeat</span>
              </div>
            </div>

            <div className={styles.completedActions}>
              <button className="btn btn-primary" onClick={onClose} id="finish-review-btn">
                Done & Back to Notes
              </button>
              <button className="btn btn-ghost" onClick={() => loadCards(true)} id="study-again-btn">
                Study Again
              </button>
            </div>
          </div>
        )}

        {/* Active Flashcard */}
        {!loading && !isCompleted && currentCard && (
          <div className={styles.cardContainer}>
            <div
              className={`${styles.flashcard} ${isFlipped ? styles.flipped : ""}`}
              onClick={() => setIsFlipped(f => !f)}
              role="button"
              tabIndex={0}
              aria-label="Flashcard. Click or press space to flip."
            >
              {/* Front of Card */}
              <div className={styles.cardFace + " " + styles.cardFront}>
                <div className={styles.cardTag}>Question / Concept</div>
                <h2 className={styles.cardTitle}>{currentCard.title}</h2>
                <div className={styles.flipHint}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg>
                  <span>Tap or press Space to flip</span>
                </div>
              </div>

              {/* Back of Card */}
              <div className={styles.cardFace + " " + styles.cardBack}>
                <div className={styles.cardTag}>Answer & Explanation</div>
                <div className={styles.cardContent}>
                  <p>{currentCard.content}</p>
                  {currentCard.diagram_type !== "none" && currentCard.diagram_data && (
                    <div className={styles.diagramBox}>
                      <pre><code>{currentCard.diagram_data}</code></pre>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rating Actions (Visible when flipped) */}
            <div className={styles.ratingBar}>
              {!isFlipped ? (
                <button
                  className={`btn btn-primary ${styles.revealBtn}`}
                  onClick={() => setIsFlipped(true)}
                  id="reveal-answer-btn"
                >
                  Reveal Answer (Space)
                </button>
              ) : (
                <div className={styles.ratingButtons}>
                  <button
                    className={`${styles.rateBtn} ${styles.rateAgain}`}
                    onClick={() => handleRate("again")}
                    disabled={submitting}
                    id="rate-again-btn"
                  >
                    <span className={styles.rateKey}>1</span>
                    <span className={styles.rateTitle}>Again</span>
                    <span className={styles.rateInterval}>&lt; 1 day</span>
                  </button>

                  <button
                    className={`${styles.rateBtn} ${styles.rateHard}`}
                    onClick={() => handleRate("hard")}
                    disabled={submitting}
                    id="rate-hard-btn"
                  >
                    <span className={styles.rateKey}>2</span>
                    <span className={styles.rateTitle}>Hard</span>
                    <span className={styles.rateInterval}>1–2 days</span>
                  </button>

                  <button
                    className={`${styles.rateBtn} ${styles.rateGood}`}
                    onClick={() => handleRate("good")}
                    disabled={submitting}
                    id="rate-good-btn"
                  >
                    <span className={styles.rateKey}>3</span>
                    <span className={styles.rateTitle}>Good</span>
                    <span className={styles.rateInterval}>3–6 days</span>
                  </button>

                  <button
                    className={`${styles.rateBtn} ${styles.rateEasy}`}
                    onClick={() => handleRate("easy")}
                    disabled={submitting}
                    id="rate-easy-btn"
                  >
                    <span className={styles.rateKey}>4</span>
                    <span className={styles.rateTitle}>Easy</span>
                    <span className={styles.rateInterval}>7+ days</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
