import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertProjectEnquiryAccess, getProjectEnquiryById } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { requireActiveCompany } from "@/lib/session";
import { ProjectProposalForm } from "@/components/project-proposals/project-proposal-form";

type PageProps = { searchParams: Promise<{ enquiryId?: string }> };

export default async function NewProjectProposalPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
    redirect("/dashboard");
  }

  let prefill:
    | { enquiryId?: string; customerName?: string; customerMobile?: string; shortAddress?: string }
    | undefined;
  const { enquiryId } = await searchParams;
  if (enquiryId) {
    let companyId: string;
    try {
      companyId = requireActiveCompany(session);
    } catch {
      redirect("/select-company");
    }
    const enquiry = await getProjectEnquiryById(prisma, companyId, enquiryId);
    if (enquiry) {
      try {
        assertProjectEnquiryAccess(session.user.roles, session.user.id, enquiry);
        prefill = {
          enquiryId: enquiry.id,
          customerName: enquiry.customerName,
          customerMobile: enquiry.customerMobile,
          shortAddress: "",
        };
      } catch {
        // Ignore unauthorized prefill and continue with blank form.
      }
    }
  }

  return (
    <ProjectProposalForm
      mode="create"
      enquiryId={prefill?.enquiryId}
      initialValues={prefill}
    />
  );
}
