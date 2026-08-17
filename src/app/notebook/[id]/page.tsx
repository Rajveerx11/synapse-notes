import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Notebook, Page, AiCard } from "@/lib/types";
import NotebookEditor from "@/components/NotebookEditor";

type Props = { params: Promise<{ id: string }> };

export default async function NotebookPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const db = getDb();

  const notebook = db
    .prepare("SELECT * FROM notebooks WHERE id = ? AND user_id = ?")
    .get(id, session.userId) as Notebook | undefined;
  if (!notebook) notFound();

  const pages = db
    .prepare("SELECT * FROM pages WHERE notebook_id = ? ORDER BY page_number")
    .all(id) as Page[];

  const cards = db
    .prepare("SELECT * FROM ai_cards WHERE notebook_id = ? ORDER BY created_at DESC")
    .all(id) as AiCard[];

  return (
    <NotebookEditor
      notebook={notebook}
      initialPages={pages}
      initialCards={cards}
      username={session.username}
    />
  );
}
