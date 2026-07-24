import { ServiceNav } from "@/components/service/service-nav";
import { requireServiceAccess } from "@/lib/service-guard";

export const dynamic = "force-dynamic";

export default async function ServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServiceAccess();

  return (
    <div className="space-y-6">
      <ServiceNav />
      {children}
    </div>
  );
}
