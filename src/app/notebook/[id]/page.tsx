import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { dbService } from "@/lib/db";
import NotebookEditor from "@/components/NotebookEditor";

type Props = { params: Promise<{ id: string }> };

export default async function NotebookPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const result = await dbService.getNotebook(id, session.userId);
  if (!result) notFound();

  const cards = await dbService.listAiCards(id);

  return (
    <NotebookEditor
      notebook={result.notebook}
      initialPages={result.pages}
      initialCards={cards}
      username={session.username}
    />
  );
}
