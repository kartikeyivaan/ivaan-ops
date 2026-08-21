import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildDispatchWhatsappUrl } from "@/lib/dispatch-share";
import { listPiDispatchedChallans } from "@/lib/dispatch-service";
import { canAllocateBankPayments } from "@/lib/banking-permissions";
import {
  canApproveBooking,
  canApproveDispatchToday,
  canApprovePiCancel,
  canApprovePiEdit,
  canApprovePiCreditAccounts,
  canApprovePiCreditSm,
  canManageProformaInvoices,
  canMarkDispatchToday,
  canRecordPayments,
  canRequestPiCancel,
  canRequestPiCredit,
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
    listPiDispatchedChallans(prisma, companyId, id),
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

  const dispatchedChallanDetails = dispatchedChallans.map((dispatch) => ({
    ...dispatch,
    whatsappUrl: buildDispatchWhatsappUrl({
      id: dispatch.id,
      dcNo: dispatch.dcNo,
      status: "DISPATCHED",
      customer: pi.customer,
      company,
      proformaInvoice: { piNo: pi.piNo },
    }),
  }));

  return (
    <ProformaInvoiceDetail
      pi={JSON.parse(JSON.stringify(pi))}
      warehouses={warehouses}
      whatsappUrl={whatsappUrl}
      dispatchedChallans={dispatchedChallanDetails}
      canManage={canManageProformaInvoices(session.user.roles)}
      canRecordPayments={canRecordPayments(session.user.roles)}
      canAllocateBankPayments={canAllocateBankPayments(session.user.roles)}
      canApproveBooking={canApproveBooking(session.user.roles)}
      canMarkDispatchToday={canMarkDispatchToday(session.user.roles)}
      canApproveDispatchToday={canApproveDispatchToday(session.user.roles)}
      canRequestCancel={canRequestPiCancel(session.user.roles)}
      canApproveCancel={canApprovePiCancel(session.user.roles)}
      canApproveEdit={canApprovePiEdit(session.user.roles)}
      canRequestCredit={canRequestPiCredit(session.user.roles)}
      canApproveCreditSm={canApprovePiCreditSm(session.user.roles)}
      canApproveCreditAccounts={canApprovePiCreditAccounts(session.user.roles)}
    />
  );
}
