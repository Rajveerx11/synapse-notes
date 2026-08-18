import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { calculateNextReview, RecallRating } from "@/lib/srs";

/**
 * GET /api/cards/review?notebookId=...
 * Returns all due flashcards for spaced repetition study session.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const notebookId = searchParams.get("notebookId") || undefined;

    const dueCards = await dbService.listDueCards(session.userId, notebookId);
    return NextResponse.json({ data: dueCards });
  } catch (err: unknown) {
    console.error("Cards review GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cards/review
 * Body: { cardId: string; rating: "again" | "hard" | "good" | "easy" }
 * Updates card with new SM-2 spaced repetition interval and next review timestamp.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { cardId, rating } = (await req.json()) as { cardId?: string; rating?: RecallRating };
    if (!cardId || !rating) {
      return NextResponse.json({ error: "cardId and valid rating required" }, { status: 400 });
    }

    // Retrieve card to get current SRS state
    const allCards = await dbService.listAiCards(cardId);
    // Find matching card across all or direct query
    const dueCards = await dbService.listDueCards(session.userId);
    const targetCard = dueCards.find(c => c.id === cardId) || allCards.find(c => c.id === cardId);

    const srsResult = calculateNextReview(
      {
        repetitions: targetCard?.repetitions ?? 0,
        intervalDays: targetCard?.interval_days ?? 0,
        easeFactor: targetCard?.ease_factor ?? 2.5,
        nextReviewAt: targetCard?.next_review_at ?? 0,
      },
      rating
    );

    await dbService.updateCardReview(cardId, srsResult);

    return NextResponse.json({ data: srsResult });
  } catch (err: unknown) {
    console.error("Cards review POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
