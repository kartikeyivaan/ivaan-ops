import { requireServiceAccess } from "@/lib/service-guard";
import { ServicePlaceholder } from "@/components/service/service-placeholder";

export default async function ServiceDashboardPage() {
  await requireServiceAccess();

  return (
    <ServicePlaceholder
      title="Service Dashboard"
      description="Service metrics and workload overview will appear here."
    />
  );
}
