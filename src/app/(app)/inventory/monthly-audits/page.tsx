import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  canManageMonthlyAudit,
  canViewMonthlyAudit,
} from "@/lib/monthly-serial-audit-permissions";
import { MonthlyAuditList } from "@/components/inventory/monthly-audit-list";

export default async function MonthlyAuditsPage() {
  const session = await auth();
  if (!session?.user || !canViewMonthlyAudit(session.user.roles)) {
    redirect("/dashboard");
  }

  return <MonthlyAuditList canManage={canManageMonthlyAudit(session.user.roles)} />;
}
