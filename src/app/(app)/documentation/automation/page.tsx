import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRunAutomation, canViewAutomation } from "@/lib/automation-permissions";
import { DcrAutomationWorkbench } from "@/components/automation/dcr-automation-workbench";
import { operationalCompanies } from "@/lib/learning/mode";

export default async function DcrAutomationPage() {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) redirect("/dashboard");

  const companies = operationalCompanies(session.user.companies ?? []).map((company) => ({
    id: company.id,
    code: company.code,
    name: company.name,
  }));

  return (
    <DcrAutomationWorkbench
      companies={companies}
      canRun={canRunAutomation(session.user.roles)}
    />
  );
}
