import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PurchaseRequestDetail } from "@/components/purchase/purchase-request-detail";
import {
  canManagePurchaseRequests,
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
} from "@/lib/purchase-request-permissions";
import { getPurchaseRequest } from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type PageProps = { params: Promise<{ id: string }> };

export default async function PurchaseRequestDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const request = await getPurchaseRequest(prisma, id);
  if (!request || request.companyId !== companyId) {
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
      isRequester={request.requestedById === session.user.id}
    />
  );
}
