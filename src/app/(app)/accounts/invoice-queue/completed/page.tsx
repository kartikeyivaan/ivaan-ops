import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageInvoiceQueue } from "@/lib/accounts-permissions";
import { listInvoiceQueue } from "@/lib/invoice-handover-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { CompletedInvoicesList } from "@/components/accounts/completed-invoices-list";

export default async function CompletedInvoicesPage() {
  const session = await auth();
  if (!session?.user || !canManageInvoiceQueue(session.user.roles)) redirect("/dashboard");
  const rows = await listInvoiceQueue(prisma, requireActiveCompany(session), { scope: "completed" });
  return <CompletedInvoicesList rows={JSON.parse(JSON.stringify(rows))} />;
}
