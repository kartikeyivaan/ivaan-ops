import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProposalPackages } from "@/lib/proposal-package-permissions";
import { ProposalPackagesAdmin } from "@/components/admin/proposal-packages-admin";

export default async function ProjectsQuotationPage() {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Projects Quotation</h1>
        <p className="text-sm text-slate-500">
          Configure subsidy and non-subsidy packages, module alternates, add-on rates, and hybrid
          pricing used when building project quotations. Existing Proposals under Projects stay
          unchanged; price edits here freeze only on new saves.
        </p>
      </div>
      <ProposalPackagesAdmin />
    </div>
  );
}
