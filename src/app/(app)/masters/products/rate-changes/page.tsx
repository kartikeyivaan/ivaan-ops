import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canCreateProductRateChange,
  canViewAllProductRateChanges,
} from "@/lib/product-rate-change-permissions";
import { listProductRateChangeBatches } from "@/lib/product-rate-change-service";
import { ProductRateChangesList } from "@/components/products/product-rate-changes-list";
import { prisma } from "@/lib/prisma";

export default async function ProductRateChangesPage() {
  const session = await auth();
  if (!session?.user || !canCreateProductRateChange(session.user.roles)) {
    redirect("/dashboard");
  }

  const batches = await listProductRateChangeBatches(prisma, {
    viewerId: session.user.id,
    viewAll: canViewAllProductRateChanges(session.user.roles),
  });

  return (
    <ProductRateChangesList
      initialBatches={JSON.parse(JSON.stringify(batches))}
      canCreate={canCreateProductRateChange(session.user.roles)}
    />
  );
}
