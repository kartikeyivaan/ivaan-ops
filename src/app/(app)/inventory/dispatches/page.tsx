import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDispatches, canViewDispatches } from "@/lib/dispatch-permissions";
import { listDispatchableProformaInvoices } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchTodayPanel } from "@/components/dispatches/dispatch-today-panel";

export default async function DispatchesPage() {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const tiles = await listDispatchableProformaInvoices(prisma, companyId);

  return (
    <DispatchTodayPanel
      tiles={JSON.parse(JSON.stringify(tiles))}
      canManage={canManageDispatches(session.user.roles)}
    />
  );
}
