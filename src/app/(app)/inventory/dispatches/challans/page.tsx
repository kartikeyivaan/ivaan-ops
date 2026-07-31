import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { listDispatches } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchChallanArchive } from "@/components/dispatches/dispatch-challan-archive";

export default async function DeliveryChallansPage() {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const dispatches = await listDispatches(prisma, companyId, {});

  return (
    <DispatchChallanArchive initialDispatches={JSON.parse(JSON.stringify(dispatches))} />
  );
}
