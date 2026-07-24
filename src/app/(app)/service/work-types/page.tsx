import { redirect } from "next/navigation";
import { requireServiceAccess } from "@/lib/service-guard";
import { canManageServiceWorkTypes } from "@/lib/service-permissions";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function ServiceWorkTypesPage() {
  const { roles } = await requireServiceAccess();
  if (!canManageServiceWorkTypes(roles)) {
    redirect("/service");
  }

  return (
    <ServicePlaceholder
      title="Service Work Types"
      description="Manage the list of service work types here."
    />
  );
}
