import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb, bootstrapSchema } from "@/lib/db";
import { Notebook } from "@/lib/types";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await bootstrapSchema();
  const db = getDb();
  const notebooks = await db`
    SELECT n.*, COUNT(p.id)::int as page_count
    FROM notebooks n
    LEFT JOIN pages p ON p.notebook_id = n.id
    WHERE n.user_id = ${session.userId}
    GROUP BY n.id
    ORDER BY n.updated_at DESC
  ` as Notebook[];

  return <DashboardClient notebooks={notebooks} username={session.username} />;
}
