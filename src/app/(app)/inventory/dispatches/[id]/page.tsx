import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveDispatchCancel,
  canManageDispatches,
  canViewDispatches,
} from "@/lib/dispatch-permissions";
import { buildDispatchWhatsappUrl } from "@/lib/dispatch-share";
import { getDispatchById } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchDetail } from "@/components/dispatches/dispatch-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function DispatchDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const [dispatch, company] = await Promise.all([
    getDispatchById(prisma, companyId, id),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    }),
  ]);
  if (!dispatch || !company) {
    notFound();
  }

  const challanWhatsappUrl = buildDispatchWhatsappUrl({
    id: dispatch.id,
    dcNo: dispatch.dcNo,
    status: dispatch.status,
    customer: dispatch.customer,
    company,
    proformaInvoice: dispatch.proformaInvoice,
  });

  return (
    <DispatchDetail
      dispatch={JSON.parse(JSON.stringify(dispatch))}
      challanWhatsappUrl={challanWhatsappUrl}
      canManage={canManageDispatches(session.user.roles)}
      canApproveCancel={canApproveDispatchCancel(session.user.roles)}
    />
  );
}
