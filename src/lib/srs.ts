/**
 * srs.ts — SuperMemo-2 (SM-2) Spaced Repetition Algorithm for Synapse Study Cards.
 *
 * Computes optimal intervals and ease factors for active recall flashcards.
 */

export type RecallRating = "again" | "hard" | "good" | "easy";

export interface SrsCardState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: number; // Unix timestamp in seconds
}

export interface SrsCalculationResult extends SrsCardState {
  rating: RecallRating;
}

/**
 * Maps human-readable recall rating to SM-2 numeric quality (0–5).
 */
export function ratingToQuality(rating: RecallRating): number {
  switch (rating) {
    case "again":
      return 0; // complete blackout
    case "hard":
      return 3; // correct response recalled with serious difficulty
    case "good":
      return 4; // correct response after a hesitation
    case "easy":
      return 5; // perfect response
  }
}

/**
 * Calculates next review interval and ease factor according to standard SM-2.
 *
 * @param current Current card SRS state (defaults to new card state if omitted)
 * @param rating User rating ("again", "hard", "good", "easy")
 * @param nowTimestamp Optional current Unix timestamp in seconds (defaults to Date.now() / 1000)
 */
export function calculateNextReview(
  current: Partial<SrsCardState> = {},
  rating: RecallRating,
  nowTimestamp = Math.floor(Date.now() / 1000)
): SrsCalculationResult {
  const q = ratingToQuality(rating);
  let reps = current.repetitions ?? 0;
  let interval = current.intervalDays ?? 0;
  let ef = current.easeFactor ?? 2.5;

  if (q < 3) {
    // Failed recall: reset repetitions to 0 and interval to 1 day
    reps = 0;
    interval = 1;
  } else {
    // Successful recall
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ef);
    }
    reps += 1;
  }

  // Update Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3; // Minimum ease factor floor

  const nextReviewAt = nowTimestamp + interval * 86400;

  return {
    repetitions: reps,
    intervalDays: interval,
    easeFactor: Math.round(ef * 100) / 100,
    nextReviewAt,
    rating,
  };
}

/**
 * Checks whether a card is currently due for review.
 */
export function isCardDue(nextReviewAt?: number | null, now = Math.floor(Date.now() / 1000)): boolean {
  if (!nextReviewAt) return true; // New cards are immediately due
  return nextReviewAt <= now;
}
