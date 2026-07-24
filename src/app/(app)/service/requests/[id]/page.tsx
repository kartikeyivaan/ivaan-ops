import { requireServiceAccess } from "@/lib/service-guard";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function ServiceRequestDetailPage() {
  await requireServiceAccess();

  return (
    <ServicePlaceholder
      title="Service Request"
      description="The service request detail view and timeline will appear here."
    />
  );
}
