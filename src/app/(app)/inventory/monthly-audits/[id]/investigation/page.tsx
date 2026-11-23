import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canManageMonthlyAudit, canViewMonthlyAudit } from "@/lib/monthly-serial-audit-permissions";
import { prisma } from "@/lib/prisma";
import { MonthlyAuditInvestigation } from "@/components/inventory/monthly-audit-investigation";

type Params = { params: Promise<{ id: string }> };

export default async function MonthlyAuditInvestigationPage({ params }: Params) {
  const session = await auth();
  if (!session?.user || !canViewMonthlyAudit(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id },
    select: { auditNumber: true },
  });
  if (!audit) redirect("/inventory/monthly-audits");

  return (
    <MonthlyAuditInvestigation
      auditId={id}
      auditNumber={audit.auditNumber}
      canManage={canManageMonthlyAudit(session.user.roles)}
    />
  );
}
