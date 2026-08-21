import { redirect } from "next/navigation";
import { SalesDailyReceiptsView } from "@/components/banking/sales-daily-receipts-view";
import { auth } from "@/lib/auth";
import { canViewSalesCreditReceipts } from "@/lib/banking-permissions";

export default async function DailyReceiptsPage() {
  const session = await auth();
  if (!session?.user || !canViewSalesCreditReceipts(session.user.roles)) {
    redirect("/dashboard");
  }

  return <SalesDailyReceiptsView />;
}
