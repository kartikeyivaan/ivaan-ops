import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { listSalesExecutivesForCompany } from "@/lib/report-builders";
import {
  canManageSalesTargets,
  listSalesTargetsForAdmin,
} from "@/lib/sales-target-service";
import { SalesTargetsAdmin } from "@/components/admin/sales-targets-admin";

export default async function SalesTargetsAdminPage() {
  const session = await auth();
  if (!session?.user || !canManageSalesTargets(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [targets, executives] = await Promise.all([
    listSalesTargetsForAdmin(prisma, companyId, session.user.id),
    listSalesExecutivesForCompany(prisma, companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sales Module Targets</h1>
        <p className="text-sm text-slate-500">
          Configure company default, executive overrides, and monthly overrides for dispatched
          module targets. Resolution order: monthly → executive → company → 3,000 hard default.
        </p>
      </div>

      <SalesTargetsAdmin initialData={{ targets, executives }} />
    </div>
  );
}
