import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewDocumentation } from "@/lib/documentation-permissions";
import { listDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DocumentationHistoryList } from "@/components/documentation/documentation-history-list";

export default async function DocumentationHistoryPage() {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) redirect("/dashboard");
  const rows = await listDocumentation(prisma, requireActiveCompany(session), { scope: "history" });
  return <DocumentationHistoryList rows={JSON.parse(JSON.stringify(rows))} />;
}
