import { redirect } from "next/navigation";
import { requireServiceAccess } from "@/lib/service-guard";
import { canCreateService } from "@/lib/service-permissions";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function NewServiceRequestPage() {
  const { roles } = await requireServiceAccess();
  if (!canCreateService(roles)) {
    redirect("/service");
  }

  return (
    <ServicePlaceholder
      title="New Service Request"
      description="The mobile-first new service request form will appear here."
    />
  );
}
