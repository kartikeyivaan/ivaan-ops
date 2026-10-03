import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreateProductRateChange } from "@/lib/product-rate-change-permissions";
import { ProductRateChangeNew } from "@/components/products/product-rate-change-new";

export default async function NewProductRateChangePage() {
  const session = await auth();
  if (!session?.user || !canCreateProductRateChange(session.user.roles)) {
    redirect("/dashboard");
  }

  return <ProductRateChangeNew />;
}
