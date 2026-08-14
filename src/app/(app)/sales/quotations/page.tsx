import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveSessionCompany } from "@/lib/company-scope";
import {
  canManageQuotationsForCompany,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { listQuotations } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { QuotationsList } from "@/components/quotations/quotations-list";

export default async function QuotationsPage() {
  const session = await auth();
  if (!session?.user || !canViewQuotations(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const quotations = await listQuotations(prisma, companyId, {});
  const activeCompany = getActiveSessionCompany(session);
  const canManage = activeCompany
    ? canManageQuotationsForCompany(session.user.roles, activeCompany)
    : false;

  return (
    <QuotationsList
      initialQuotations={JSON.parse(JSON.stringify(quotations))}
      canManage={canManage}
    />
  );
}
