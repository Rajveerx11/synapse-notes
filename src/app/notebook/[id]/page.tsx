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

  const notebooks = await db`
    SELECT * FROM notebooks WHERE id = ${id} AND user_id = ${session.userId}
  ` as Notebook[];
  if (notebooks.length === 0) notFound();

  const pages = await db`
    SELECT * FROM pages WHERE notebook_id = ${id} ORDER BY page_number
  ` as Page[];

  const cards = await db`
    SELECT * FROM ai_cards WHERE notebook_id = ${id} ORDER BY created_at DESC
  ` as AiCard[];

  return (
    <NotebookEditor
      notebook={notebooks[0]}
      initialPages={pages}
      initialCards={cards}
      username={session.username}
    />
  );
}
