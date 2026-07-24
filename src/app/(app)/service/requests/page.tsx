import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import { canCreateService, canViewAllService } from "@/lib/service-permissions";
import { listServiceExecutives, listServiceWorkTypes } from "@/lib/service-service";
import { ServiceRequestsList } from "@/components/service/service-requests-list";

export default async function ServiceRequestsPage() {
  const { roles, companyId } = await requireServiceAccess();

  const [workTypes, executives] = await Promise.all([
    listServiceWorkTypes(prisma),
    listServiceExecutives(prisma, companyId),
  ]);

  return (
    <ServiceRequestsList
      workTypes={workTypes.map((wt) => ({ id: wt.id, name: wt.name }))}
      executives={executives.map((exec) => ({ id: exec.id, name: exec.name }))}
      showExecutiveFilter={canViewAllService(roles)}
      canCreate={canCreateService(roles)}
    />
  );
}
