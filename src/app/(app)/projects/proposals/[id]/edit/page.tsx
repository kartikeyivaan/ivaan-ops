import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageProjectProposals,
} from "@/lib/project-proposal-permissions";
import {
  assertProjectProposalEditable,
  getProjectProposalById,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { mapRevisionToFormValues } from "@/lib/project-proposal-revision";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalForm } from "@/components/project-proposals/project-proposal-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProjectProposalPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
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
    assertProjectProposalEditable(session.user.roles, session.user.id, proposal);
  } catch {
    redirect(`/projects/proposals/${id}`);
  }

  const revision = proposal.currentRevision;
  if (!revision) notFound();

  const brands = await prisma.proposalInverterBrandMaster.findMany({
    select: { code: true, name: true },
  });

  return (
    <ProjectProposalForm
      mode="edit"
      proposalId={proposal.id}
      proposalNo={proposal.proposalNo}
      initialValues={mapRevisionToFormValues(revision, brands)}
    />
  );
}
