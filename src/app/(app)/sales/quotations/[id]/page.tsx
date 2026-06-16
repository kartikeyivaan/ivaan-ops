import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveQuotationPricing,
  canManageQuotations,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { getQuotationById } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { QuotationDetail } from "@/components/quotations/quotation-detail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuotationDetailPage({ params }: PageProps) {
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

  const { id } = await params;
  const quotation = await getQuotationById(prisma, companyId, id);
  if (!quotation) {
    notFound();
  }

  return (
    <QuotationDetail
      quotation={JSON.parse(JSON.stringify(quotation))}
      canManage={canManageQuotations(session.user.roles)}
      canApprovePricing={canApproveQuotationPricing(session.user.roles)}
    />
  );
}
