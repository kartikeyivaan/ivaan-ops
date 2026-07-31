import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessApprovalsInbox } from "@/lib/approvals-permissions";
import { listApprovalHistory } from "@/lib/approvals-service";
import { ApprovalsHistoryList } from "@/components/approvals/approvals-history-list";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsHistoryPage() {
  const session = await auth();
  if (!session?.user || !canAccessApprovalsInbox(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const items = await listApprovalHistory(prisma, companyId, session.user.roles);

  return <ApprovalsHistoryList items={JSON.parse(JSON.stringify(items))} />;
}
