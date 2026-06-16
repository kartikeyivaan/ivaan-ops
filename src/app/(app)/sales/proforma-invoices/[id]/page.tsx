import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveBooking,
  canManageProformaInvoices,
  canRecordPayments,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
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
  const [pi, warehouses] = await Promise.all([
    getProformaInvoiceById(prisma, companyId, id),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!pi) {
    notFound();
  }

  return (
    <ProformaInvoiceDetail
      pi={JSON.parse(JSON.stringify(pi))}
      warehouses={warehouses}
      canManage={canManageProformaInvoices(session.user.roles)}
      canRecordPayments={canRecordPayments(session.user.roles)}
      canApproveBooking={canApproveBooking(session.user.roles)}
    />
  );
}
