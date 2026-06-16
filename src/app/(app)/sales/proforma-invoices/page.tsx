import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageProformaInvoices,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import { listProformaInvoices } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProformaInvoicesList } from "@/components/proforma-invoices/proforma-invoices-list";

export default async function ProformaInvoicesPage() {
  const session = await auth();
  if (!session?.user || !canViewProformaInvoices(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const rows = await listProformaInvoices(prisma, companyId, {});

  return (
    <ProformaInvoicesList
      initialProformaInvoices={JSON.parse(JSON.stringify(rows))}
      canManage={canManageProformaInvoices(session.user.roles)}
    />
  );
}
