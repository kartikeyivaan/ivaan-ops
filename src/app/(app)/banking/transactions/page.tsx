import { redirect } from "next/navigation";
import { BankTransactionsList } from "@/components/banking/bank-transactions-list";
import { auth } from "@/lib/auth";
import { canViewFullBankTransactions } from "@/lib/banking-permissions";

export default async function BankingTransactionsPage() {
  const session = await auth();
  if (!session?.user || !canViewFullBankTransactions(session.user.roles)) {
    redirect("/dashboard");
  }

  return <BankTransactionsList />;
}
