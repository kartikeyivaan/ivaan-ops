import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canAccessPurchaseModule,
  canManagePurchaseRequests,
} from "@/lib/purchase-request-permissions";

export default async function PurchasePage() {
  const session = await auth();
  if (!session?.user || !canAccessPurchaseModule(session.user.roles)) {
    redirect("/dashboard");
  }

  if (canManagePurchaseRequests(session.user.roles)) {
    redirect("/purchase/incoming");
  }

  redirect("/purchase/requests");
}
