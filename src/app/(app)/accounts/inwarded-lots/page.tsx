import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewInwardedLots } from "@/lib/accounts-permissions";
import { AccountsInwardedLotsList } from "@/components/accounts/inwarded-lots-list";
import { listIncomingLots, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function AccountsInwardedLotsPage() {
  const session = await auth();
  if (!session?.user || !canViewInwardedLots(session.user.roles)) {
    redirect("/dashboard");
  }

  const lotsPage = await listIncomingLots(prisma, requireActiveCompany(session), {
    inwardedOnly: true,
    excludeInternalTransfers: true,
    page: 1,
    pageSize: 50,
  });

  const sanitizedLots = JSON.parse(
    JSON.stringify(lotsPage.items.map((lot) => serializeLotForRole(lot, false))),
  ) as ReturnType<typeof serializeLotForRole>[];

  return (
    <AccountsInwardedLotsList
      initialLots={sanitizedLots}
      initialTotal={lotsPage.total}
      initialPage={lotsPage.page}
      initialPageSize={lotsPage.pageSize}
    />
  );
}
