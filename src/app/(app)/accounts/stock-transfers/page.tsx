import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewAccountsStockTransfers } from "@/lib/accounts-permissions";
import { AccountsStockTransfersList } from "@/components/accounts/stock-transfers-list";
import { listAccountsStockTransfers } from "@/lib/cross-company-transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function AccountsStockTransfersPage() {
  const session = await auth();
  if (!session?.user || !canViewAccountsStockTransfers(session.user.roles)) {
    redirect("/dashboard");
  }
  const rows = await listAccountsStockTransfers(prisma, requireActiveCompany(session));
  return <AccountsStockTransfersList rows={JSON.parse(JSON.stringify(rows))} />;
}
