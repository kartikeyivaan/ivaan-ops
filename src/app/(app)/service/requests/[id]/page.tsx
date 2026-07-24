import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import { restrictServiceToAssigned } from "@/lib/service-permissions";
import { getServiceRequestById } from "@/lib/service-service";
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

  const request = JSON.parse(JSON.stringify(record)) as ServiceRequestDetail;

  return <ServiceRequestDetailView request={request} />;
}
