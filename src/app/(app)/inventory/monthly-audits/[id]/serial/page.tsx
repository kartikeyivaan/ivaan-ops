import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  canScanMonthlyAudit,
  canViewMonthlyAudit,
} from "@/lib/monthly-serial-audit-permissions";
import { prisma } from "@/lib/prisma";
import { MonthlyAuditSerialPanel } from "@/components/inventory/monthly-audit-serial-panel";

type Params = { params: Promise<{ id: string }> };

export default async function MonthlyAuditSerialPage({ params }: Params) {
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
    <MonthlyAuditSerialPanel
      auditId={id}
      canScan={canScanMonthlyAudit(session.user.roles)}
      isOpen={audit.status === "OPEN"}
    />
  );
}
