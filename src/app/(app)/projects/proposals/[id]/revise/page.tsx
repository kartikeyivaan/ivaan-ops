import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  canManageProjectProposals,
  canViewProjectProposals,
} from "@/lib/project-proposal-permissions";
import {
  assertProjectProposalAccess,
  getProjectProposalById,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import {
  canReviseProjectProposal,
  mapRevisionToFormValues,
} from "@/lib/project-proposal-revision";
import { formatRevisionProposalLabel } from "@/lib/project-proposals";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalForm } from "@/components/project-proposals/project-proposal-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function ReviseProjectProposalPage({ params }: PageProps) {
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
  if (!proposal) notFound();

  try {
    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);
  } catch {
    redirect("/projects/proposals");
  }

  if (!canManageProjectProposals(session.user.roles) || !canReviseProjectProposal(proposal.status)) {
    redirect(`/projects/proposals/${id}`);
  }

  const revision = proposal.currentRevision;
  if (!revision) notFound();

  const brands = await prisma.proposalInverterBrandMaster.findMany({
    select: { code: true, name: true },
  });

  const nextRevisionNo = proposal.currentRevisionNo + 1;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/proposals/${id}`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {proposal.proposalNo} ({formatRevisionProposalLabel(proposal.currentRevisionNo)})
      </Link>
      <ProjectProposalForm
        mode="revise"
        proposalId={proposal.id}
        proposalNo={proposal.proposalNo}
        nextRevisionNo={nextRevisionNo}
        initialValues={mapRevisionToFormValues(revision, brands)}
      />
    </div>
  );
}
