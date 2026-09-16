import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageTeamTasks } from "@/lib/task-permissions";
import { TaskDetailView } from "@/components/tasks/task-detail-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function TaskDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <TaskDetailView
      taskId={id}
      currentUserId={session.user.id}
      canManageTeam={canManageTeamTasks(session.user.roles)}
    />
  );
}
