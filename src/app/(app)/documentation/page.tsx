import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewDocumentation } from "@/lib/documentation-permissions";
import { countPendingInvoiceDocumentation, listDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DocumentationList } from "@/components/documentation/documentation-list";

export default async function DocumentationPage() {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) redirect("/dashboard");
  const companyId = requireActiveCompany(session);
  const [rows, pendingInvoiceCount] = await Promise.all([
    listDocumentation(prisma, companyId, { scope: "active" }),
    countPendingInvoiceDocumentation(prisma, companyId),
  ]);
  return (
    <DocumentationList
      rows={JSON.parse(JSON.stringify(rows))}
      pendingInvoiceCount={pendingInvoiceCount}
    />
  );
}
