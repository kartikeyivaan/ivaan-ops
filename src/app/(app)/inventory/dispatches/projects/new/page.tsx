import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProjectDispatches } from "@/lib/project-permissions";
import { ProjectDispatchForm } from "@/components/projects/project-dispatch-form";

type PageProps = { searchParams: Promise<{ projectId?: string }> };

export default async function NewProjectDispatchPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageProjectDispatches(session.user.roles)) {
    redirect("/inventory/dispatches?tab=projects");
  }

  const { projectId } = await searchParams;
  return <ProjectDispatchForm defaultProjectId={projectId} />;
}
