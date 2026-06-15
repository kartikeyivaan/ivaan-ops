import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEditCustomers } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { CustomerForm } from "@/components/customers/customer-form";

export default async function NewCustomerPage() {
  const session = await auth();
  if (!session?.user || !canEditCustomers(session.user.roles)) {
    redirect("/sales/customers");
  }

  const companyId = requireActiveCompany(session);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Customer</h1>
        <p className="text-sm text-slate-500">Create a company-owned customer record.</p>
      </div>
      <CustomerForm mode="create" salesExecutives={salesExecutives} />
    </div>
  );
}
