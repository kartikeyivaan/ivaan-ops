import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessApprovalsInbox } from "@/lib/approvals-permissions";
import { listPendingApprovals } from "@/lib/approvals-service";
import { PendingApprovalsList } from "@/components/approvals/pending-approvals-list";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
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

  const items = await listPendingApprovals(prisma, companyId, session.user.roles);

  return <PendingApprovalsList initialItems={JSON.parse(JSON.stringify(items))} />;
}
