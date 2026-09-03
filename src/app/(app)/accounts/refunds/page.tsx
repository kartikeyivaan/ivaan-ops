import { redirect } from "next/navigation";
import { RefundsList } from "@/components/refunds/refunds-list";
import { auth } from "@/lib/auth";
import {
  canAccessRefundsModule,
  canRequestRefund,
  canViewAllRefunds,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { listCustomerRefunds } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";

export default async function RefundsPage() {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const [refunds, firms] = await Promise.all([
    listCustomerRefunds(prisma, {
      companyIds,
      ownRequestsOnlyForUserId: canViewAllRefunds(session.user.roles)
        ? undefined
        : session.user.id,
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
    />
  );
}
