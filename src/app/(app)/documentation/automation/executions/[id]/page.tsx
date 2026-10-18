import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRunAutomation, canViewAutomation } from "@/lib/automation-permissions";
import { getAutomationExecution } from "@/lib/automation-service";
import { DcrAutomationExecutionDetail } from "@/components/automation/dcr-automation-execution-detail";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";

export default async function DcrAutomationExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) redirect("/dashboard");

  const { id } = await params;
  const execution = await getAutomationExecution(prisma, id);
  if (!execution) notFound();

  const sessionCompanyIds = getSessionCompanyIds(session);
  for (const row of execution.companies) {
    if (!assertCompanyAccess(session.user.roles, sessionCompanyIds, row.companyId)) {
      redirect("/documentation/automation");
    }
  }

  return (
    <DcrAutomationExecutionDetail
      initial={JSON.parse(JSON.stringify(execution))}
      canRun={canRunAutomation(session.user.roles)}
    />
  );
}
