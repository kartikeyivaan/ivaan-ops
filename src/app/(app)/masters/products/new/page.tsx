import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canEditProducts,
  canManageProductPricing,
} from "@/lib/product-permissions";
import { listMasters } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/products/product-form";

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user || !canEditProducts(session.user.roles)) {
    redirect("/masters/products");
  }

  const masters = await listMasters(prisma);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Product</h1>
        <p className="text-sm text-slate-500">Create a product with auto-generated display name.</p>
      </div>
      <ProductForm
        mode="create"
        categories={masters.categories}
        brands={masters.brands}
        technologies={masters.technologies}
        canManagePricing={canManageProductPricing(session.user.roles)}
      />
    </div>
  );
}
