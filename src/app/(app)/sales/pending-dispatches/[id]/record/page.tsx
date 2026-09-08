import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DispatchForm } from "@/components/dispatches/dispatch-form";
import { canRecordQueuedDispatch } from "@/lib/pi-permissions";
import { getQueuedPiForDispatch } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";

type PageProps = { params: Promise<{ id: string }> };

export default async function RecordPendingDispatchPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canRecordQueuedDispatch(session.user.roles)) {
    redirect("/sales/pending-dispatches");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const { id } = await params;
  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);

  try {
    const { pi, dateWindow } = await getQueuedPiForDispatch(prisma, companyId, id, {
      salesUserId,
    });
    return (
      <DispatchForm
        mode="sales"
        defaultPiId={pi.id}
        lockedPi={JSON.parse(JSON.stringify(pi))}
        dateWindow={dateWindow}
      />
    );
  } catch {
    notFound();
  }
}
