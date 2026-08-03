import { redirect } from "next/navigation";
import { decimalToNumber } from "@/lib/inventory";
import { auth } from "@/lib/auth";
import { PurchaseRequestCreateForm } from "@/components/purchase/purchase-request-create-form";
import { canRaisePurchaseRequest } from "@/lib/purchase-request-permissions";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";

export default async function NewPurchaseRequestPage() {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    redirect("/purchase/requests");
  }

  const companyId = requireActiveCompany(session);
  const companyIds = getSessionCompanyIds(session);

  const [companies, warehouses, products, categories] = await Promise.all([
    prisma.company.findMany({
      where: isSuperAdmin(session.user.roles) ? { isActive: true } : { id: { in: companyIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(isSuperAdmin(session.user.roles) ? {} : { companyId: { in: companyIds } }),
      },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, companyId: true },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        category: { name: { not: "Kit" } },
      },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        gstRate: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Raise Purchase Request</h1>
        <p className="text-sm text-slate-500">
          Select existing products or create new ones, then submit demand to Purchase.
        </p>
      </div>
      <PurchaseRequestCreateForm
        companies={companies}
        warehouses={warehouses}
        products={products.map((product) => ({
          id: product.id,
          displayName: product.displayName,
          categoryName: product.category.name,
          brandName: product.brand.name,
          gstRate: decimalToNumber(product.gstRate),
        }))}
        categories={categories}
        defaultCompanyId={companyId}
      />
    </div>
  );
}
