import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApprovePanelDamage,
  canReportDamage,
  canViewDamagedItems,
} from "@/lib/inventory-permissions";
import { listDamageReports } from "@/lib/damage-report-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DamagedItemsList } from "@/components/inventory/damaged-items-list";

export default async function DamagedItemsPage() {
  const session = await auth();
  if (!session?.user || !canViewDamagedItems(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const items = await listDamageReports(prisma, companyId);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <DamagedItemsList
        initialItems={items}
        canCreate={canReportDamage(session.user.roles)}
        canApprove={canApprovePanelDamage(session.user.roles)}
      />
    </Suspense>
  );
}
