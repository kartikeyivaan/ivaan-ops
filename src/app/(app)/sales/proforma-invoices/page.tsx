import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProformaInvoices, canViewProformaInvoices } from "@/lib/pi-permissions";
import { listProformaInvoices } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { listSalesExecutivesForCompany } from "@/lib/report-builders";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { canViewTeamSalesDashboard } from "@/lib/sales-dashboard/dashboard-permissions";
import { requireActiveCompany } from "@/lib/session";
import { proformaInvoiceSearchSchema } from "@/lib/validations";
import { ProformaInvoicesList } from "@/components/proforma-invoices/proforma-invoices-list";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ProformaInvoicesPage({ searchParams }: PageProps) {
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

  const params = await searchParams;
  const rawSalesUserId = first(params.salesUserId);
  const parsed = proformaInvoiceSearchSchema.safeParse({
    q: first(params.q),
    status: first(params.status),
    customerId: first(params.customerId),
    salesUserId: rawSalesUserId && rawSalesUserId !== "all" ? rawSalesUserId : undefined,
    fromDate: first(params.fromDate),
    toDate: first(params.toDate),
    outstandingOnly: first(params.outstandingOnly),
  });

  const filters = parsed.success ? parsed.data : {};
  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    filters.salesUserId,
  );
  const canFilterByExecutive = canViewTeamSalesDashboard(session.user.roles);

  const [rows, salesExecutives] = await Promise.all([
    listProformaInvoices(prisma, companyId, {
      ...filters,
      salesUserId,
    }),
    canFilterByExecutive
      ? listSalesExecutivesForCompany(prisma, companyId)
      : Promise.resolve([]),
  ]);

  return (
    <ProformaInvoicesList
      initialProformaInvoices={JSON.parse(JSON.stringify(rows))}
      salesExecutives={salesExecutives}
      canManage={canManageProformaInvoices(session.user.roles)}
      canFilterByExecutive={canFilterByExecutive}
      initialFilters={{
        q: filters.q ?? "",
        status: filters.status ?? "",
        fromDate: filters.fromDate ?? "",
        toDate: filters.toDate ?? "",
        salesUserId: salesUserId ?? "",
        outstandingOnly: Boolean(filters.outstandingOnly),
      }}
    />
  );
}
