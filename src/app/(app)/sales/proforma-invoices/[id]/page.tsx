import { DispatchStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildDispatchWhatsappUrl } from "@/lib/dispatch-share";
import { listDispatches } from "@/lib/dispatch-service";
import {
  canApproveBooking,
  canApproveDispatchToday,
  canManageProformaInvoices,
  canMarkDispatchToday,
  canRecordPayments,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import { buildProformaInvoiceWhatsappUrl } from "@/lib/pi-share";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProformaInvoiceDetail } from "@/components/proforma-invoices/proforma-invoice-detail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProformaInvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewProformaInvoices(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const { id } = await params;
  const [pi, warehouses, company, dispatchedChallans] = await Promise.all([
    getProformaInvoiceById(prisma, companyId, id),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    }),
    listDispatches(prisma, companyId, {
      proformaInvoiceId: id,
      status: DispatchStatus.DISPATCHED,
    }),
  ]);

  if (!pi || !company) {
    notFound();
  }

  const whatsappUrl = buildProformaInvoiceWhatsappUrl({
    id: pi.id,
    piNo: pi.piNo,
    status: pi.status,
    customer: pi.customer,
    company,
    salesUser: pi.salesUser,
  });

  const challanShares = dispatchedChallans.map((dispatch) => ({
    id: dispatch.id,
    dcNo: dispatch.dcNo,
    whatsappUrl: buildDispatchWhatsappUrl({
      id: dispatch.id,
      dcNo: dispatch.dcNo,
      status: dispatch.status,
      customer: dispatch.customer,
      company,
      proformaInvoice: dispatch.proformaInvoice,
    }),
  }));

  return (
    <ProformaInvoiceDetail
      pi={JSON.parse(JSON.stringify(pi))}
      warehouses={warehouses}
      whatsappUrl={whatsappUrl}
      challanShares={challanShares}
      canManage={canManageProformaInvoices(session.user.roles)}
      canRecordPayments={canRecordPayments(session.user.roles)}
      canApproveBooking={canApproveBooking(session.user.roles)}
      canMarkDispatchToday={canMarkDispatchToday(session.user.roles)}
      canApproveDispatchToday={canApproveDispatchToday(session.user.roles)}
    />
  );
}
