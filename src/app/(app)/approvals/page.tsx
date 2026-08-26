import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessApprovalsInbox } from "@/lib/approvals-permissions";
import { listPendingApprovals } from "@/lib/approvals-service";
import { PendingApprovalsList } from "@/components/approvals/pending-approvals-list";
import { resolveDashboardCompanyIds } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await auth();
  if (!session?.user || !canAccessApprovalsInbox(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = resolveDashboardCompanyIds(session);
  if (companyIds.length === 0) {
    redirect("/select-company");
  }

  const items = await listPendingApprovals(prisma, companyIds, session.user.roles);

  return <PendingApprovalsList initialItems={JSON.parse(JSON.stringify(items))} />;
}
