import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import { canCreateService } from "@/lib/service-permissions";
import { listServiceExecutives, listServiceWorkTypes } from "@/lib/service-service";
import { NewServiceRequestForm } from "@/components/service/new-service-request-form";

export default async function NewServiceRequestPage() {
  const { roles, companyId } = await requireServiceAccess();
  if (!canCreateService(roles)) {
    redirect("/service");
  }

  const [workTypes, executives] = await Promise.all([
    listServiceWorkTypes(prisma),
    listServiceExecutives(prisma, companyId),
  ]);

  return (
    <NewServiceRequestForm
      workTypes={workTypes.map((wt) => ({ id: wt.id, name: wt.name }))}
      executives={executives}
    />
  );
}
