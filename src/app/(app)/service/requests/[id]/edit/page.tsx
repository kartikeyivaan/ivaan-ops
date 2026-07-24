import { redirect } from "next/navigation";
import { requireServiceAccess } from "@/lib/service-guard";
import { canEditService } from "@/lib/service-permissions";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function EditServiceRequestPage() {
  const { roles } = await requireServiceAccess();
  if (!canEditService(roles)) {
    redirect("/service");
  }

  return (
    <ServicePlaceholder
      title="Edit Service Request"
      description="The service request edit form will appear here."
    />
  );
}
