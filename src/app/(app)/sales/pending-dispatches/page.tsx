import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PendingDispatchesList } from "@/components/proforma-invoices/pending-dispatches-list";
import { canApprovePiCancel, canViewPendingDispatches } from "@/lib/pi-permissions";
import { listPendingDispatchPis } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";

export default async function PendingDispatchesPage() {
  const session = await auth();
  if (!session?.user || !canViewPendingDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);
  const result = await listPendingDispatchPis(prisma, companyId, { salesUserId });

  return (
    <PendingDispatchesList
      initialRows={JSON.parse(JSON.stringify(result.items))}
      canApproveCancel={canApprovePiCancel(session.user.roles)}
    />
  );
}
