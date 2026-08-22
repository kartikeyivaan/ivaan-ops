import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canApprovePiEdit, canManageProformaInvoices } from "@/lib/pi-permissions";
import { listCustomers } from "@/lib/customer-service";
import { listProducts } from "@/lib/product-service";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProformaInvoiceForm } from "@/components/proforma-invoices/proforma-invoice-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function EditProformaInvoicePage({ params }: PageProps) {
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

  const { id } = await params;
  const pi = await getProformaInvoiceById(prisma, companyId, id);
  if (!pi) {
    notFound();
  }

  if (!pi.canEdit) {
    redirect(`/sales/proforma-invoices/${id}`);
  }

  const [customers, products] = await Promise.all([
    listCustomers(prisma, companyId, { status: "ACTIVE", unpaged: true }),
    listProducts(prisma, companyId, { isActive: true }),
  ]);

  const customerOptions = customers.items.map((customer) => ({
    id: customer.id,
    customerName: customer.customerName,
    gstNumber: customer.gstNumber,
  }));
  if (!customerOptions.some((customer) => customer.id === pi.customer.id)) {
    customerOptions.unshift({
      id: pi.customer.id,
      customerName: pi.customer.customerName,
      gstNumber: pi.customer.gstNumber,
    });
  }

  const productOptions = products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    pricingType: product.pricingType,
    capacity: Number(product.capacity),
    gstRate: Number(product.gstRate),
    currentPrice: product.currentPrice
      ? { standardPrice: Number(product.currentPrice.standardPrice) }
      : null,
  }));
  for (const item of pi.items) {
    if (!productOptions.some((product) => product.id === item.product.id)) {
      productOptions.push({
        id: item.product.id,
        displayName: item.product.displayName,
        pricingType: item.product.pricingType,
        capacity: Number(item.product.capacity),
        gstRate: Number(item.product.gstRate),
        currentPrice: null,
      });
    }
  }

  return (
    <ProformaInvoiceForm
      mode="edit"
      piId={pi.id}
      piNo={pi.piNo}
      status={pi.status}
      requiresApproval={!canApprovePiEdit(session.user.roles)}
      lockCustomer={true}
      customers={customerOptions}
      products={productOptions}
      defaultCustomerId={pi.customer.id}
      initialNotes={pi.notes ?? ""}
      initialLines={pi.items.map((item) => ({
        productId: item.product.id,
        qty: String(item.qty),
        rate: String(item.rate),
      }))}
    />
  );
}
