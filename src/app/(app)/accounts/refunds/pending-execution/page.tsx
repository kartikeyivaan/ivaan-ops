import { redirect } from "next/navigation";
import { RefundExecutionQueue } from "@/components/refunds/refund-execution-queue";
import { auth } from "@/lib/auth";
import { CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES } from "@/lib/customer-refund-constants";
import {
  canProcessRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { listCustomerRefunds } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";

export default async function RefundPendingExecutionPage() {
  const session = await auth();
  if (!session?.user || !canProcessRefund(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const [refunds, firms] = await Promise.all([
    listCustomerRefunds(prisma, {
      companyIds,
      statuses: CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES,
    }),
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <RefundExecutionQueue initialRefunds={refunds} firms={firms} />;
}
