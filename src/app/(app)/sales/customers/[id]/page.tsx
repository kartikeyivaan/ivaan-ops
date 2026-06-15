import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEditCustomers, canViewCustomers } from "@/lib/customer-permissions";
import { getCustomerById } from "@/lib/customer-service";
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
  const customer = await getCustomerById(prisma, companyId, id);
  if (!customer) {
    notFound();
  }

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
    <CustomerProfile
      customer={customer}
      salesExecutives={salesExecutives}
      canEdit={canEditCustomers(session.user.roles)}
    />
  );
}
