import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  canViewProjectProposals,
  canManageProjectProposals,
  canApproveProjectProposals,
} from "@/lib/project-proposal-permissions";
import { canConvertProjectProposal } from "@/lib/project-permissions";
import {
  assertProjectProposalAccess,
  getProjectProposalById,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalDetail } from "@/components/project-proposals/project-proposal-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectProposalDetailPage({ params }: PageProps) {
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

  const { id } = await params;
  const proposal = await getProjectProposalById(prisma, companyId, id);
  if (!proposal) {
    notFound();
  }

  try {
    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);
  } catch {
    redirect("/projects/proposals");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/projects/proposals"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to proposals
      </Link>
      <ProjectProposalDetail
        proposal={JSON.parse(JSON.stringify(proposal))}
        canManage={canManageProjectProposals(session.user.roles)}
        canApprove={canApproveProjectProposals(session.user.roles)}
        canConvert={canConvertProjectProposal(session.user.roles)}
      />
    </div>
  );
}
