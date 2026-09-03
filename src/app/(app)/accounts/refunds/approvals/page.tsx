import { redirect } from "next/navigation";
import { RefundsList } from "@/components/refunds/refunds-list";
import { auth } from "@/lib/auth";
import {
  canApproveRefund,
  canRequestRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { CUSTOMER_REFUND_APPROVAL_QUEUE_STATUSES } from "@/lib/customer-refund-constants";
import { listCustomerRefunds } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";

export default async function RefundApprovalQueuePage() {
  const session = await auth();
  if (!session?.user || !canApproveRefund(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const [refunds, firms] = await Promise.all([
    listCustomerRefunds(prisma, {
      companyIds,
      statuses: CUSTOMER_REFUND_APPROVAL_QUEUE_STATUSES,
    }),
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RefundsList
      initialRefunds={refunds}
      firms={firms}
      canRequest={canRequestRefund(session.user.roles)}
      title="Refund Approval Queue"
      description="Refund requests awaiting your approval. Open a refund to see the complete request before deciding."
      emptyMessage="No refunds are awaiting approval."
    />
  );
}
