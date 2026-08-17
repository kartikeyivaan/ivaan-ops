import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageQuotations,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { listQuotations } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { QuotationsList } from "@/components/quotations/quotations-list";

export const dynamic = "force-dynamic";

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

  return (
    <QuotationsList
      initialQuotations={JSON.parse(JSON.stringify(quotations))}
      canManage={canManageQuotations(session.user.roles)}
    />
  );
}
