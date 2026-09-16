import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewAllTasks, canViewTeamTasks } from "@/lib/task-permissions";
import { TasksHub } from "@/components/tasks/tasks-hub";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading tasks…</p>}>
      <TasksHub
        currentUserId={session.user.id}
        canViewTeam={canViewTeamTasks(session.user.roles)}
        canViewAll={canViewAllTasks(session.user.roles)}
      />
    </Suspense>
  );
}
