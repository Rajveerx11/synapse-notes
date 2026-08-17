import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { dbService } from "@/lib/db";
import { Notebook, Page, AiCard } from "@/lib/types";
import NotebookEditor from "@/components/NotebookEditor";

type Props = { params: Promise<{ id: string }> };

export default async function NotebookPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const now = Math.floor(Date.now() / 1000);

  let result: { notebook: Notebook; pages: Page[] } | null = null;
  let cards: AiCard[] = [];

  try {
    result = await dbService.getNotebook(id, session.userId);
    cards = await dbService.listAiCards(id);
  } catch (e) {
    console.warn("Error fetching notebook from server:", e);
  }

  const defaultNotebook: Notebook = {
    id,
    user_id: session.userId,
    title: "Untitled Notebook",
    subject: "",
    created_at: now,
    updated_at: now,
  };

  const defaultPages: Page[] = [
    {
      id: "p1",
      notebook_id: id,
      page_number: 1,
      strokes_json: "[]",
      text_content: "",
      pdf_url: null,
      pdf_page: null,
      updated_at: now,
    },
  ];

  return (
    <NotebookEditor
      notebook={result?.notebook || defaultNotebook}
      initialPages={result?.pages && result.pages.length > 0 ? result.pages : defaultPages}
      initialCards={cards}
      username={session.username}
    />
  );
}
