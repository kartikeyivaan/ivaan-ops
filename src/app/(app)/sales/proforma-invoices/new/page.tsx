import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { listCustomers } from "@/lib/customer-service";
import { listProducts } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProformaInvoiceForm } from "@/components/proforma-invoices/proforma-invoice-form";

type PageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewProformaInvoicePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageProformaInvoices(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const params = await searchParams;
  const [customers, products] = await Promise.all([
    listCustomers(prisma, companyId, { status: "ACTIVE" }),
    listProducts(prisma, companyId, { isActive: true }),
  ]);

  return (
    <ProformaInvoiceForm
      customers={customers.map((customer) => ({
        id: customer.id,
        customerName: customer.customerName,
        gstNumber: customer.gstNumber,
      }))}
      products={products.map((product) => ({
        id: product.id,
        displayName: product.displayName,
        pricingType: product.pricingType,
        capacity: Number(product.capacity),
        gstRate: Number(product.gstRate),
        currentPrice: product.currentPrice
          ? { standardPrice: Number(product.currentPrice.standardPrice) }
          : null,
      }))}
      defaultCustomerId={params.customerId}
    />
  );
}
