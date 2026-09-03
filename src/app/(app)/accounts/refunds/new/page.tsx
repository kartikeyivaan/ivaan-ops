import { redirect } from "next/navigation";
import { RefundCreateForm } from "@/components/refunds/refund-create-form";
import { auth } from "@/lib/auth";
import {
  canRequestRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { prisma } from "@/lib/prisma";

export default async function NewRefundPage() {
  const session = await auth();
  if (!session?.user || !canRequestRefund(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const [firms, customers] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Fallback picker for receipts that were never allocated to a PI.
    prisma.customer.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, customerCode: true, customerName: true },
      orderBy: { customerName: "asc" },
    }),
  ]);

  return (
    <RefundCreateForm
      firms={firms}
      customers={customers.map((customer) => ({
        id: customer.id,
        label: `${customer.customerName} (${customer.customerCode})`,
      }))}
    />
  );
}
