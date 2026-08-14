import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageQuotations, canManageQuotationsForCompany } from "@/lib/quotation-permissions";
import { listCustomers } from "@/lib/customer-service";
import { listProducts } from "@/lib/product-service";
import { getQuotationById } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { QuotationForm } from "@/components/quotations/quotation-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function ReviseQuotationPage({ params }: PageProps) {
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

  const { id } = await params;
  const quotation = await getQuotationById(prisma, companyId, id);
  if (!quotation) {
    notFound();
  }

  if (!canManageQuotationsForCompany(session.user.roles, quotation.company)) {
    redirect(`/sales/quotations/${id}`);
  }

  // Only sent (or expired) quotations can be revised. Drafts and converted
  // quotations cannot, so send the user back to the detail view.
  if (quotation.status !== "SENT" && quotation.status !== "EXPIRED") {
    redirect(`/sales/quotations/${id}`);
  }

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

  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    customerName: customer.customerName,
    gstNumber: customer.gstNumber,
    address: customer.address,
    city: customer.city,
    state: customer.state,
  }));
  if (!customerOptions.some((customer) => customer.id === quotation.customer.id)) {
    customerOptions.unshift({
      id: quotation.customer.id,
      customerName: quotation.customer.customerName,
      gstNumber: quotation.customer.gstNumber,
      address: quotation.customer.address ?? null,
      city: quotation.customer.city ?? null,
      state: quotation.customer.state ?? null,
    });
  }

  const salesExecutiveOptions = salesExecutives.some(
    (user) => user.id === quotation.salesUser.id,
  )
    ? salesExecutives
    : [
        {
          id: quotation.salesUser.id,
          name: quotation.salesUser.name ?? quotation.salesUser.email ?? "Sales Executive",
          email: quotation.salesUser.email ?? "",
        },
        ...salesExecutives,
      ];

  const initialLines = quotation.items.map((item) => ({
    productId: item.product.id,
    qty: String(item.qty),
    rate: String(item.rate),
  }));

  return (
    <QuotationForm
      mode="revise"
      quotationId={quotation.id}
      quotationNo={quotation.quotationNo}
      customers={customerOptions}
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
      defaultCustomerId={quotation.customer.id}
      salesExecutives={salesExecutiveOptions}
      defaultSalesUserId={quotation.salesUser.id}
      initialLines={initialLines}
      initialNotes={quotation.notes ?? ""}
      initialDeliveryTermMode={
        quotation.deliveryTermMode === "LEGACY"
          ? "SUBJECT_TO_AVAILABILITY"
          : quotation.deliveryTermMode
      }
      initialRequiredPaymentPercent={
        quotation.requiredPaymentPercent == null
          ? null
          : Number(quotation.requiredPaymentPercent)
      }
      initialDispatchMinDays={quotation.dispatchMinDays}
      initialDispatchMaxDays={quotation.dispatchMaxDays}
    />
  );
}
