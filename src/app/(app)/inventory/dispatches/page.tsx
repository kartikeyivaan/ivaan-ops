import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDispatches, canViewDispatches } from "@/lib/dispatch-permissions";
import { listDispatches } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchList } from "@/components/dispatches/dispatch-list";

export default async function DispatchesPage() {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const dispatches = await listDispatches(prisma, companyId, {});

  return (
    <DispatchList
      initialDispatches={JSON.parse(JSON.stringify(dispatches))}
      canManage={canManageDispatches(session.user.roles)}
    />
  );
}
