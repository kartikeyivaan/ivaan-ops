import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveOpeningStock,
  canPerformInventoryAudits,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  getOpeningAudit,
  serializeOpeningAudit,
} from "@/lib/inventory-audit-service";
import { canEditProducts } from "@/lib/product-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { OpeningAuditWorkbench } from "@/components/inventory/opening-audit-workbench";

type Params = { params: Promise<{ id: string }> };

export default async function OpeningAuditPage({ params }: Params) {
  const session = await auth();
  if (!session?.user || !canViewInventoryAudits(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;

  let audit;
  try {
    audit = serializeOpeningAudit(await getOpeningAudit(prisma, companyId, id));
  } catch {
    redirect("/inventory/audits");
  }

  const [products, categories, brands, technologies] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        serialTracking: true,
        category: { select: { name: true } },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.productTechnology.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <OpeningAuditWorkbench
      initialAudit={audit}
      products={products}
      categories={categories}
      brands={brands}
      technologies={technologies}
      canEdit={canPerformInventoryAudits(session.user.roles)}
      canApprove={canApproveOpeningStock(session.user.roles)}
      canCreateProduct={canEditProducts(session.user.roles)}
    />
  );
}
