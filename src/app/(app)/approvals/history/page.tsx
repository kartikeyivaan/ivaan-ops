import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessApprovalsInbox } from "@/lib/approvals-permissions";
import { listApprovalHistory } from "@/lib/approvals-service";
import { ApprovalsHistoryList } from "@/components/approvals/approvals-history-list";
import { resolveDashboardCompanyIds } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ApprovalsHistoryPage() {
  const session = await auth();
  if (!session?.user || !canAccessApprovalsInbox(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = resolveDashboardCompanyIds(session);
  if (companyIds.length === 0) {
    redirect("/select-company");
  }

  const items = await listApprovalHistory(prisma, companyIds, session.user.roles);

  return <ApprovalsHistoryList items={JSON.parse(JSON.stringify(items))} />;
}
