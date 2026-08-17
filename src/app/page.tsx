import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { dbService } from "@/lib/db";
import { Notebook } from "@/lib/types";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let notebooks: Notebook[] = [];
  try {
    notebooks = await dbService.listNotebooks(session.userId);
  } catch (e) {
    console.error("Dashboard list error:", e);
  }

  return <DashboardClient notebooks={notebooks} username={session.username} />;
}
