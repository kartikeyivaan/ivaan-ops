import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import { canManageServiceWorkTypes } from "@/lib/service-permissions";
import { listServiceWorkTypes } from "@/lib/service-service";
import {
  ServiceWorkTypesManager,
  type WorkType,
} from "@/components/service/service-work-types-manager";

export default async function ServiceWorkTypesPage() {
  const { roles } = await requireServiceAccess();
  if (!canManageServiceWorkTypes(roles)) {
    redirect("/service");
  }

  const workTypes = await listServiceWorkTypes(prisma, { includeInactive: true });

  const initial: WorkType[] = workTypes.map((wt) => ({
    id: wt.id,
    name: wt.name,
    defaultTargetDays: wt.defaultTargetDays,
    isActive: wt.isActive,
    displayOrder: wt.displayOrder,
  }));

  return <ServiceWorkTypesManager initialWorkTypes={initial} />;
}
