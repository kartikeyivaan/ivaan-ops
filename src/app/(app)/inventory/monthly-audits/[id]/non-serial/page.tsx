import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  canScanMonthlyAudit,
  canViewMonthlyAudit,
} from "@/lib/monthly-serial-audit-permissions";
import { prisma } from "@/lib/prisma";
import { MonthlyAuditNonSerialPanel } from "@/components/inventory/monthly-audit-non-serial-panel";

type Params = { params: Promise<{ id: string }> };

export default async function MonthlyAuditNonSerialPage({ params }: Params) {
  const session = await auth();
  if (!session?.user || !canViewMonthlyAudit(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!audit) redirect("/inventory/monthly-audits");

  return (
    <MonthlyAuditNonSerialPanel
      auditId={id}
      canCount={canScanMonthlyAudit(session.user.roles)}
      isOpen={audit.status === "OPEN"}
    />
  );
}
