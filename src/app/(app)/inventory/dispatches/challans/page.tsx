import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { listDispatches } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";
import { dispatchSearchSchema } from "@/lib/validations";
import { DispatchChallanArchive } from "@/components/dispatches/dispatch-challan-archive";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function DeliveryChallansPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const params = await searchParams;
  const parsed = dispatchSearchSchema.safeParse({
    q: first(params.q),
    status: first(params.status),
    customerId: first(params.customerId),
    proformaInvoiceId: first(params.proformaInvoiceId),
    salesUserId: first(params.salesUserId),
    fromDate: first(params.fromDate),
    toDate: first(params.toDate),
  });

  const filters = parsed.success ? parsed.data : {};
  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    filters.salesUserId,
  );

  const dispatches = await listDispatches(prisma, companyId, {
    ...filters,
    salesUserId,
  });

  return (
    <DispatchChallanArchive
      initialDispatches={JSON.parse(JSON.stringify(dispatches))}
      initialFilters={{
        q: filters.q ?? "",
        status: filters.status ?? "",
        fromDate: filters.fromDate ?? "",
        toDate: filters.toDate ?? "",
        salesUserId: salesUserId ?? "",
      }}
    />
  );
}
