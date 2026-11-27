import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildDispatchWhatsappUrl } from "@/lib/dispatch-share";
import { listPiDispatchedChallans } from "@/lib/dispatch-service";
import { canAllocateBankPayments } from "@/lib/banking-permissions";
import {
  canApproveBooking,
  canDecideManualPayments,
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
import {
  isManualEntryBlocked,
  listPendingManualPaymentRequests,
} from "@/lib/manual-payment-service";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { resolveDashboardCompanyIds } from "@/lib/company-scope";
import { isSuperAdmin } from "@/lib/rbac";
import { ProformaInvoiceDetail } from "@/components/proforma-invoices/proforma-invoice-detail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProformaInvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewProformaInvoices(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const companyIds = resolveDashboardCompanyIds(session);
  if (companyIds.length === 0) {
    redirect("/select-company");
  }

  const scoped = await prisma.proformaInvoice.findFirst({
    where: { id, companyId: { in: companyIds } },
    select: { companyId: true },
  });
  if (!scoped) {
    notFound();
  }
  const companyId = scoped.companyId;

  const [pi, warehouses, company, dispatchedChallans, manualEntryBlocked, pendingManualRequests] =
    await Promise.all([
    getProformaInvoiceById(prisma, companyId, id),
    prisma.warehouse.findMany({
      where: {
        companyId,
        isActive: true,
        // Projects WH is not available for sales booking.
        NOT: { code: "JAL-PRJ" },
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    }),
    listPiDispatchedChallans(prisma, companyId, id),
    isManualEntryBlocked(prisma, companyId),
    listPendingManualPaymentRequests(prisma, companyId, id),
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
      canReopenPartial={isSuperAdmin(session.user.roles)}
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
      canDecideManualPayments={canDecideManualPayments(session.user.roles)}
      manualEntryBlocked={manualEntryBlocked}
      pendingManualRequests={JSON.parse(
        JSON.stringify(
          pendingManualRequests.map((row) => ({
            id: row.id,
            amount: row.amount,
            paymentDate: row.paymentDate.toISOString().slice(0, 10),
            paymentMode: row.paymentMode,
            receivedInAccount: row.receivedInAccount,
            referenceNo: row.referenceNo,
            notes: row.notes,
            requestedBy: row.requestedBy.name,
            createdAt: row.createdAt.toISOString(),
          })),
        ),
      )}
    />
  );
}
