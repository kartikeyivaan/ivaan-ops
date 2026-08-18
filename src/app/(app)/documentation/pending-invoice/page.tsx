import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDocumentation, canViewDocumentation } from "@/lib/documentation-permissions";
import { listPendingInvoiceDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DocumentationPendingInvoiceList } from "@/components/documentation/documentation-pending-invoice-list";

export default async function DocumentationPendingInvoicePage() {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) redirect("/dashboard");
  const rows = await listPendingInvoiceDocumentation(prisma, requireActiveCompany(session));
  return (
    <DocumentationPendingInvoiceList
      rows={JSON.parse(JSON.stringify(rows))}
      canManage={canManageDocumentation(session.user.roles)}
    />
  );
}
