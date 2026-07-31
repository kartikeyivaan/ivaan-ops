import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageInvoiceQueue } from "@/lib/accounts-permissions";
import { listInvoiceQueue } from "@/lib/invoice-handover-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { InvoiceQueue } from "@/components/accounts/invoice-queue";

export default async function InvoiceQueuePage() {
  const session = await auth();
  if (!session?.user || !canManageInvoiceQueue(session.user.roles)) redirect("/dashboard");
  const rows = await listInvoiceQueue(prisma, requireActiveCompany(session), { scope: "pending" });
  return <InvoiceQueue rows={JSON.parse(JSON.stringify(rows))} />;
}
