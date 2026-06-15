import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canEditProducts,
  canManageProductPricing,
  canViewProducts,
} from "@/lib/product-permissions";
import { getProductById, listMasters } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProductProfile } from "@/components/products/product-profile";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewProducts(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const [product, masters] = await Promise.all([
    getProductById(prisma, id, companyId),
    listMasters(prisma),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <ProductProfile
      product={product}
      companyId={companyId}
      categories={masters.categories}
      brands={masters.brands}
      technologies={masters.technologies}
      canEdit={canEditProducts(session.user.roles)}
      canManagePricing={canManageProductPricing(session.user.roles)}
    />
  );
}
