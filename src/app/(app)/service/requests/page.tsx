import { requireServiceAccess } from "@/lib/service-guard";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function ServiceRequestsPage() {
  await requireServiceAccess();

  return (
    <ServicePlaceholder
      title="Service Requests"
      description="The searchable, filterable list of service requests will appear here."
    />
  );
}
