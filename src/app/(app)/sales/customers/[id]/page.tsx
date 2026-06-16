import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEditCustomers, canViewCustomers } from "@/lib/customer-permissions";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { canManageQuotations } from "@/lib/quotation-permissions";
import { getCustomerById } from "@/lib/customer-service";
import { listDispatches } from "@/lib/dispatch-service";
import { listProformaInvoices } from "@/lib/pi-service";
import { listQuotations } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { CustomerProfile } from "@/components/customers/customer-profile";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const [customer, salesExecutives, customerQuotations, customerProformaInvoices, customerPayments, customerDispatches] =
    await Promise.all([
    getCustomerById(prisma, companyId, id),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        companies: { some: { companyId } },
        roles: {
          some: {
            role: {
              name: {
                in: [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN],
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    listQuotations(prisma, companyId, { customerId: id }),
    listProformaInvoices(prisma, companyId, { customerId: id }),
    prisma.payment.findMany({
      where: { companyId, customerId: id },
      include: { proformaInvoice: { select: { piNo: true } } },
      orderBy: { paymentDate: "desc" },
    }),
    listDispatches(prisma, companyId, { customerId: id }),
  ]);
  if (!customer) {
    notFound();
  }

  return (
    <CustomerProfile
      customer={customer}
      salesExecutives={salesExecutives}
      customerQuotations={JSON.parse(JSON.stringify(customerQuotations))}
      customerProformaInvoices={JSON.parse(JSON.stringify(customerProformaInvoices))}
      customerPayments={JSON.parse(
        JSON.stringify(
          customerPayments.map((payment) => ({
            id: payment.id,
            amount: Number(payment.amount),
            paymentDate: payment.paymentDate.toISOString().slice(0, 10),
            paymentMode: payment.paymentMode,
            referenceNo: payment.referenceNo,
            proformaInvoice: payment.proformaInvoice,
          })),
        ),
      )}
      customerDispatches={JSON.parse(JSON.stringify(customerDispatches))}
      canEdit={canEditCustomers(session.user.roles)}
      canManageQuotations={canManageQuotations(session.user.roles)}
      canManageProformaInvoices={canManageProformaInvoices(session.user.roles)}
    />
  );
}
