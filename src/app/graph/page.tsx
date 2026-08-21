import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { dbService } from "@/lib/db";
import { buildKnowledgeGraph } from "@/lib/knowledgeGraph";
import KnowledgeGraphView from "@/components/KnowledgeGraphView";

export default async function GraphPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { notebooks, pages, cards } = await dbService.getKnowledgeGraphData(session.userId);
  const graph = buildKnowledgeGraph(notebooks, pages, cards);

  return <KnowledgeGraphView graph={graph} username={session.username} />;
}
