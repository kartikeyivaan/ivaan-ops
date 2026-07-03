import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveProjectProposals,
  canManageProjectProposals,
  canViewProjectProposals,
  restrictProjectProposalSalesUserId,
} from "@/lib/project-proposal-permissions";
import { ROLES } from "@/lib/rbac";
import { listProjectProposals } from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalsList } from "@/components/project-proposals/project-proposals-list";

export default async function ProjectProposalsPage() {
  const session = await auth();
  if (!session?.user || !canViewProjectProposals(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const salesUserId = restrictProjectProposalSalesUserId(
    session.user.roles,
    session.user.id,
    undefined,
  );

  const proposals = await listProjectProposals(prisma, companyId, {
    ...(salesUserId ? { salesUserId } : {}),
  });

  const showExecutiveFilter =
    session.user.roles.includes(ROLES.PROJECTS_MANAGER) ||
    session.user.roles.includes(ROLES.SUPER_ADMIN);

  return (
    <ProjectProposalsList
      initialProposals={JSON.parse(JSON.stringify(proposals))}
      canManage={canManageProjectProposals(session.user.roles)}
      canApprove={canApproveProjectProposals(session.user.roles)}
      showExecutiveFilter={showExecutiveFilter}
    />
  );
}
