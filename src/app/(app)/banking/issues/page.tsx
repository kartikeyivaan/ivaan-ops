import { redirect } from "next/navigation";
import { ReconciliationIssuesList } from "@/components/banking/reconciliation-issues-list";
import { auth } from "@/lib/auth";
import { canManageReconciliation } from "@/lib/banking-permissions";

export default async function BankingIssuesPage() {
  const session = await auth();
  if (!session?.user || !canManageReconciliation(session.user.roles)) {
    redirect("/dashboard");
  }

  return <ReconciliationIssuesList />;
}
