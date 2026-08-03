import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PurchaseRequestDetail } from "@/components/purchase/purchase-request-detail";
import {
  canAccessPurchaseRequestCompany,
  canManagePurchaseOps,
  canManagePurchaseRequests,
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
  getAccessiblePurchaseCompanyIds,
} from "@/lib/purchase-request-permissions";
import { getPurchaseRequest } from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function PurchaseRequestDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = await getAccessiblePurchaseCompanyIds(prisma, session);
  const { id } = await params;
  const request = await getPurchaseRequest(prisma, id);
  if (!request || !canAccessPurchaseRequestCompany(companyIds, request.companyId)) {
    notFound();
  }

  if (
    !canViewAllPurchaseRequests(session.user.roles) &&
    request.requestedById !== session.user.id
  ) {
    redirect("/purchase/requests");
  }

  return (
    <PurchaseRequestDetail
      initialRequest={request}
      canManage={canManagePurchaseRequests(session.user.roles)}
      canCreateIncomingLot={canManagePurchaseOps(session.user.roles)}
      isRequester={request.requestedById === session.user.id}
    />
  );
}
