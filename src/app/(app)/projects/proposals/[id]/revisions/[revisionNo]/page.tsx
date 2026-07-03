import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { canViewProjectProposals } from "@/lib/project-proposal-permissions";
import {
  assertProjectProposalAccess,
  getProjectProposalById,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalRevisionView } from "@/components/project-proposals/project-proposal-revision-view";

type PageProps = { params: Promise<{ id: string; revisionNo: string }> };

export default async function ProjectProposalRevisionPage({ params }: PageProps) {
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

  const { id, revisionNo: revisionNoParam } = await params;
  const revisionNo = Number(revisionNoParam);
  if (!Number.isInteger(revisionNo) || revisionNo < 0) {
    notFound();
  }

  const proposal = await getProjectProposalById(prisma, companyId, id);
  if (!proposal) notFound();

  try {
    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);
  } catch {
    redirect("/projects/proposals");
  }

  if (revisionNo === proposal.currentRevisionNo) {
    redirect(`/projects/proposals/${id}`);
  }

  const revision = proposal.revisions.find((entry) => entry.revisionNo === revisionNo);
  if (!revision) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/proposals/${id}`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {proposal.proposalNo}
      </Link>
      <ProjectProposalRevisionView
        proposalId={proposal.id}
        proposalNo={proposal.proposalNo}
        currentRevisionNo={proposal.currentRevisionNo}
        revision={JSON.parse(JSON.stringify(revision))}
      />
    </div>
  );
}
