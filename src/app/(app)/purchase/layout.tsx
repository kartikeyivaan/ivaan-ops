import { auth } from "@/lib/auth";
import { PurchaseNav } from "@/components/purchase/purchase-nav";
import { canManagePurchaseRequests } from "@/lib/purchase-request-permissions";

export default async function PurchaseLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const canManagePurchase = canManagePurchaseRequests(session?.user?.roles ?? []);

  return (
    <div className="space-y-6">
      <PurchaseNav canManagePurchase={canManagePurchase} />
      {children}
    </div>
  );
}
