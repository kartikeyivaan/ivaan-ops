import { PurchaseNav } from "@/components/purchase/purchase-nav";

export default function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseNav />
      {children}
    </div>
  );
}
