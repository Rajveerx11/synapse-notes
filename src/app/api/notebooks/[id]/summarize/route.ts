import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db";
import { requireSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/notebooks/[id]/summarize
 *
 * Body: { page_number: number; ocr_text?: string; pdf_slide_text?: string }
 *
 * Calls OpenAI chat completions to generate a structured lecture summary.
 * Falls back gracefully if no API key is set — returns extraction-only mode.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Ownership check
    if (session.userId !== "mcp") {
      const owner = await dbService.getNotebookOwner(id);
      if (owner && owner !== session.userId) {
        return NextResponse.json({ error: "Access forbidden" }, { status: 403 });
      }
      if (!owner) {
        await dbService.createNotebook(id, session.userId, "Untitled Notebook", "");
      }
    }

    const { page_number, ocr_text, pdf_slide_text } = await req.json();
    if (!page_number || typeof page_number !== "number") {
      return NextResponse.json({ error: "page_number is required" }, { status: 400 });
    }

    const rawText = [ocr_text, pdf_slide_text].filter(Boolean).join("\n\n").trim();
    if (!rawText) {
      return NextResponse.json({ error: "No text content to summarize" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let summary: {
      title: string;
      key_concepts: string[];
      definitions: Record<string, string>;
      follow_up_questions: string[];
    };

    if (!apiKey) {
      // Offline extraction — basic keyword + sentence heuristics
      summary = extractOffline(rawText);
    } else {
      const systemPrompt = `You are an expert study assistant. Analyze the provided lecture/note content and return ONLY a JSON object with this exact schema:
{
  "title": "concise topic title",
  "key_concepts": ["concept 1", "concept 2", ...],          // 3-8 main ideas
  "definitions": { "term": "definition", ... },              // important terms defined
  "follow_up_questions": ["question 1", "question 2", ...]  // 3-5 exam-style questions
}
No markdown, no prose — raw JSON only.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: rawText.slice(0, 4000) },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("OpenAI error:", errText);
        summary = extractOffline(rawText);
      } else {
        const json = await response.json();
        const content: string = json.choices?.[0]?.message?.content || "{}";
        try {
          // Strip markdown fences if present
          const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          summary = JSON.parse(cleaned);
        } catch {
          summary = extractOffline(rawText);
        }
      }
    }

    // Persist to DB
    const saved = await dbService.saveLectureSummary({
      notebook_id: id,
      page_number,
      title: summary.title || `Page ${page_number} Summary`,
      key_concepts: summary.key_concepts || [],
      definitions: summary.definitions || {},
      follow_up_questions: summary.follow_up_questions || [],
      raw_text: rawText,
      model_used: apiKey ? model : "offline",
    });

    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (err: unknown) {
    console.error("Summarize route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

/** GET /api/notebooks/[id]/summarize?page=N — list summaries */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page");
    const summaries = await dbService.listLectureSummaries(id, page ? Number(page) : undefined);
    return NextResponse.json({ data: summaries });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// ── Offline extraction heuristics ──────────────────────────────────────────

function extractOffline(text: string): {
  title: string;
  key_concepts: string[];
  definitions: Record<string, string>;
  follow_up_questions: string[];
} {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const title = sentences[0]?.slice(0, 80) || "Lecture Notes";

  // Extract noun phrases appearing 2+ times as key concepts
  const wordFreq: Record<string, number> = {};
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  for (const w of words) {
    const STOP = new Set(["that","this","with","from","have","they","will","your","been","were","what","when","which","also","more","some","than","then","these","those","into","only","over","such","even","like","make","just","should","could","would","about","after","before","through","because"]);
    if (!STOP.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  const key_concepts = Object.entries(wordFreq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  // Simple definition extraction: "X is Y" or "X: Y"
  const definitions: Record<string, string> = {};
  const defMatches = text.matchAll(/\b([A-Z][a-zA-Z ]{2,30})\s*(?:is|are|refers to|means|defined as)[:\s]+([^.]{10,120})/g);
  for (const m of defMatches) {
    definitions[m[1].trim()] = m[2].trim();
    if (Object.keys(definitions).length >= 5) break;
  }

  const follow_up_questions = sentences.slice(1, 4).map((s) => `What does "${s.slice(0, 60)}..." mean?`);

  return { title, key_concepts, definitions, follow_up_questions };
}
