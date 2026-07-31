import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canPerformInventoryAudits,
  canSeeBlindSystemQty,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  getDailyAudit,
  serializeDailyAudit,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DailyAuditWorkbench } from "@/components/inventory/daily-audit-workbench";

type Params = { params: Promise<{ id: string }> };

export default async function DailyAuditPage({ params }: Params) {
  const session = await auth();
  if (!session?.user || !canViewInventoryAudits(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;

  let audit;
  try {
    audit = serializeDailyAudit(await getDailyAudit(prisma, companyId, id), {
      revealSystemQty: canSeeBlindSystemQty(session.user.roles),
    });
  } catch {
    redirect("/inventory/audits");
  }

  return (
    <DailyAuditWorkbench
      initialAudit={audit}
      canEdit={canPerformInventoryAudits(session.user.roles)}
    />
  );
}
