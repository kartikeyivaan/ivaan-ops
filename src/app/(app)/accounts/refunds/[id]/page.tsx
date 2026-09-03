import { notFound, redirect } from "next/navigation";
import { RefundDetail } from "@/components/refunds/refund-detail";
import { auth } from "@/lib/auth";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  canApproveRefund,
  canCancelRefund,
  canEditRefundDraft,
  canProcessRefund,
  canViewAllRefunds,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  getCustomerRefund,
  getCustomerRefundActivity,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";

export default async function RefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const refund = await getCustomerRefund(prisma, id);

  if (!refund || !canAccessRefundCompany(companyIds, refund.companyId)) {
    notFound();
  }
  if (
    !canViewAllRefunds(session.user.roles) &&
    refund.requestedById !== session.user.id
  ) {
    notFound();
  }

  const activity = await getCustomerRefundActivity(prisma, refund.id);

  return (
    <RefundDetail
      initialRefund={refund}
      initialActivity={activity}
      canApprove={canApproveRefund(session.user.roles)}
      canProcess={canProcessRefund(session.user.roles)}
      canEdit={canEditRefundDraft(
        session.user.roles,
        refund.requestedById,
        session.user.id,
      )}
      canCancel={canCancelRefund(
        session.user.roles,
        refund.requestedById,
        session.user.id,
      )}
    />
  );
}
