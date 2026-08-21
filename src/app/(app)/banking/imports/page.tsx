import { redirect } from "next/navigation";
import { BankImportsList } from "@/components/banking/bank-imports-list";
import { auth } from "@/lib/auth";
import { canViewBankImportHistory } from "@/lib/banking-permissions";

export default async function BankingImportsPage() {
  const session = await auth();
  if (!session?.user || !canViewBankImportHistory(session.user.roles)) {
    redirect("/dashboard");
  }

  return <BankImportsList />;
}
