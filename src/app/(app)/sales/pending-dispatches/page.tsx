import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PendingDispatchesList } from "@/components/proforma-invoices/pending-dispatches-list";
import { canApprovePiCancel, canViewPendingDispatches } from "@/lib/pi-permissions";
import { listPendingDispatchPis } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { resolveDashboardCompanyIds } from "@/lib/company-scope";

export const dynamic = "force-dynamic";

export default async function PendingDispatchesPage() {
  const session = await auth();
  if (!session?.user || !canViewPendingDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  // Active company, or every operational company when "All companies" is selected.
  const companyIds = resolveDashboardCompanyIds(session);
  if (companyIds.length === 0) {
    redirect("/select-company");
  }

  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);
  const results = await Promise.all(
    companyIds.map(async (companyId) => {
      const result = await listPendingDispatchPis(prisma, companyId, { salesUserId });
      return result.items.map((item) => ({ ...item, companyId }));
    }),
  );
  const rows = results
    .flat()
    .sort((a, b) => (a.queuedAt ?? "").localeCompare(b.queuedAt ?? ""));

  return (
    <PendingDispatchesList
      initialRows={JSON.parse(JSON.stringify(rows))}
      canApproveCancel={canApprovePiCancel(session.user.roles)}
    />
  );
}
