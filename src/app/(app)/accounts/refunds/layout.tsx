import { redirect } from "next/navigation";
import { RefundsNav } from "@/components/refunds/refunds-nav";
import { auth } from "@/lib/auth";
import {
  canAccessRefundsModule,
  canApproveRefund,
  canProcessRefund,
} from "@/lib/customer-refund-permissions";

export default async function RefundsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <RefundsNav
        canApprove={canApproveRefund(session.user.roles)}
        canProcess={canProcessRefund(session.user.roles)}
      />
      {children}
    </div>
  );
}
