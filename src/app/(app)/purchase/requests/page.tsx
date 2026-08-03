import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PurchaseRequestsList } from "@/components/purchase/purchase-requests-list";
import {
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
} from "@/lib/purchase-request-permissions";
import { listPurchaseRequests } from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function PurchaseRequestsPage() {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const requests = await listPurchaseRequests(prisma, {
    companyId,
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
