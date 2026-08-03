import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PurchaseRequestsList } from "@/components/purchase/purchase-requests-list";
import {
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
  getAccessiblePurchaseCompanyIds,
} from "@/lib/purchase-request-permissions";
import { listPurchaseRequests } from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";

export default async function PurchaseRequestsPage() {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessiblePurchaseCompanyIds(prisma, session);
  const requests = await listPurchaseRequests(prisma, {
    companyIds,
    requestedById: canViewAllPurchaseRequests(session.user.roles)
      ? undefined
      : session.user.id,
  });

  return (
    <PurchaseRequestsList
      initialRequests={requests}
      canRaise={canRaisePurchaseRequest(session.user.roles)}
    />
  );
}
