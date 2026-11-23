import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DispatchForm } from "@/components/dispatches/dispatch-form";
import { canRecordQueuedDispatch } from "@/lib/pi-permissions";
import { getQueuedPiForDispatch } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireAccessibleCompany } from "@/lib/company-scope";
import { requireActiveCompany } from "@/lib/session";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
};

export default async function RecordPendingDispatchPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canRecordQueuedDispatch(session.user.roles)) {
    redirect("/sales/pending-dispatches");
  }

  // The list passes the PI's own company; check it against the user's access.
  const { companyId: requestedCompanyId } = await searchParams;
  let companyId: string;
  try {
    companyId = requestedCompanyId
      ? requireAccessibleCompany(session, requestedCompanyId)
      : requireActiveCompany(session);
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
        companyId={companyId}
      />
    );
  } catch {
    notFound();
  }
}
