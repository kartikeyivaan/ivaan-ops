import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { ProjectProposalForm } from "@/components/project-proposals/project-proposal-form";

export default async function NewProjectProposalPage() {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
    redirect("/dashboard");
  }

  return <ProjectProposalForm mode="create" />;
}
