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
import { CustomersList } from "@/components/customers/customers-list";

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const customers = await listCustomers(prisma, companyId, {});

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
        salesExecutives={salesExecutives}
        canEdit={canEditCustomers(session.user.roles)}
        canReassign={canReassignCustomers(session.user.roles)}
      />
    </Suspense>
  );
}
