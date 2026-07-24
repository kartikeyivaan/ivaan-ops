import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import {
  canAddServiceUpdate,
  canAssignService,
  canCloseService,
  canCompleteService,
  canReopenService,
  canUpdateServiceStatus,
  restrictServiceToAssigned,
} from "@/lib/service-permissions";
import { getServiceRequestById, listServiceExecutives } from "@/lib/service-service";
import {
  ServiceRequestDetailView,
  type ServiceRequestDetail,
} from "@/components/service/service-request-detail";

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, roles, userId } = await requireServiceAccess();
  const { id } = await params;

  const record = await getServiceRequestById(prisma, companyId, id);
  if (!record) {
    notFound();
  }

  // Executives may only view requests assigned to them.
  if (restrictServiceToAssigned(roles) && record.assignedToUserId !== userId) {
    notFound();
  }

  const canAct = canAssignService(roles) || canAddServiceUpdate(roles);
  const executives = canAct ? await listServiceExecutives(prisma, companyId) : [];

  const request = JSON.parse(JSON.stringify(record)) as ServiceRequestDetail;

  return (
    <ServiceRequestDetailView
      request={request}
      executives={executives.map((exec) => ({ id: exec.id, name: exec.name }))}
      permissions={{
        canAssign: canAssignService(roles),
        canUpdateStatus: canUpdateServiceStatus(roles),
        canAddUpdate: canAddServiceUpdate(roles),
        canComplete: canCompleteService(roles),
        canClose: canCloseService(roles),
        canReopen: canReopenService(roles),
      }}
    />
  );
}
