import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canEditCustomers,
  canReassignCustomers,
  canViewCustomers,
} from "@/lib/customer-permissions";
import { listCustomers } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { customerSearchSchema } from "@/lib/validations";
import { CustomersList } from "@/components/customers/customers-list";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const params = await searchParams;
  const parsed = customerSearchSchema.safeParse({
    q: first(params.q),
    city: first(params.city),
    customerType: first(params.customerType),
    assignedSalesUserId: first(params.assignedSalesUserId),
    status: first(params.status),
    outstandingOnly: first(params.outstandingOnly),
    page: first(params.page),
    pageSize: first(params.pageSize),
  });
  const filters = parsed.success ? parsed.data : customerSearchSchema.parse({});

  const customersPage = await listCustomers(prisma, companyId, filters);
  const customers = customersPage.items;

  const salesExecutives = await prisma.user.findMany({
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
  });

  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading customers...</div>}>
      <CustomersList
        initialCustomers={customers}
        initialTotal={customersPage.total}
        initialPage={customersPage.page}
        initialPageSize={customersPage.pageSize}
        salesExecutives={salesExecutives}
        canEdit={canEditCustomers(session.user.roles)}
        canReassign={canReassignCustomers(session.user.roles)}
        initialOutstandingOnly={Boolean(filters.outstandingOnly)}
      />
    </Suspense>
  );
}
