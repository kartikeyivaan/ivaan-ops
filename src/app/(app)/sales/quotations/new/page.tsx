import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageQuotations } from "@/lib/quotation-permissions";
import { listCustomers } from "@/lib/customer-service";
import { listProducts } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { QuotationForm } from "@/components/quotations/quotation-form";

type PageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageQuotations(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const params = await searchParams;
  const [customers, products, salesExecutives] = await Promise.all([
    listCustomers(prisma, companyId, { status: "ACTIVE" }),
    listProducts(prisma, companyId, { isActive: true }),
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
  ]);

  const currentUserInList = salesExecutives.some((user) => user.id === session.user.id);
  const salesExecutiveOptions = currentUserInList
    ? salesExecutives
    : [
        {
          id: session.user.id,
          name: session.user.name ?? session.user.email ?? "Current User",
          email: session.user.email ?? "",
        },
        ...salesExecutives,
      ];

  return (
    <QuotationForm
      customers={customers.map((customer) => ({
        id: customer.id,
        customerName: customer.customerName,
        gstNumber: customer.gstNumber,
        address: customer.address,
        city: customer.city,
        state: customer.state,
      }))}
      products={products.map((product) => ({
        id: product.id,
        displayName: product.displayName,
        pricingType: product.pricingType,
        capacity: Number(product.capacity),
        gstRate: Number(product.gstRate),
        currentPrice: product.currentPrice
          ? {
              standardPrice: Number(product.currentPrice.standardPrice),
              minimumPrice: Number(product.currentPrice.minimumPrice),
            }
          : null,
      }))}
      defaultCustomerId={params.customerId}
      salesExecutives={salesExecutiveOptions}
      defaultSalesUserId={session.user.id}
    />
  );
}
