import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { Notebook } from "@/lib/types";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const db = getDb();
  const notebooks = db
    .prepare(
      `SELECT n.*, COUNT(p.id) as page_count
       FROM notebooks n
       LEFT JOIN pages p ON p.notebook_id = n.id
       WHERE n.user_id = ?
       GROUP BY n.id
       ORDER BY n.updated_at DESC`
    )
    .all(session.userId) as Notebook[];

  return <DashboardClient notebooks={notebooks} username={session.username} />;
}
