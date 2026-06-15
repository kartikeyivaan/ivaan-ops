import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canEditProducts,
  canViewProducts,
} from "@/lib/product-permissions";
import { listMasters, listProducts } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProductsList } from "@/components/products/products-list";

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user || !canViewProducts(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [products, masters] = await Promise.all([
    listProducts(prisma, companyId, {}),
    listMasters(prisma),
  ]);

  return (
    <ProductsList
      initialProducts={products}
      categories={masters.categories}
      brands={masters.brands}
      canEdit={canEditProducts(session.user.roles)}
    />
  );
}
