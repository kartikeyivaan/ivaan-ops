import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  canManageMonthlyAudit,
  canScanMonthlyAudit,
  canViewMonthlyAudit,
} from "@/lib/monthly-serial-audit-permissions";
import { MonthlyAuditOverview } from "@/components/inventory/monthly-audit-overview";

type Params = { params: Promise<{ id: string }> };

export default async function MonthlyAuditPage({ params }: Params) {
  const session = await auth();
  if (!session?.user || !canViewMonthlyAudit(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  return (
    <MonthlyAuditOverview
      auditId={id}
      canManage={canManageMonthlyAudit(session.user.roles)}
      canScan={canScanMonthlyAudit(session.user.roles)}
    />
  );
}
