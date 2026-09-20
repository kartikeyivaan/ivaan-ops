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

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  let lotsPage: Awaited<ReturnType<typeof listIncomingLots>>;
  try {
    lotsPage = await listIncomingLots(prisma, companyId, {
      inwardedOnly: true,
      excludeInternalTransfers: true,
      page: 1,
      pageSize: 50,
    });
  } catch (error) {
    console.error("[inwarded-lots] list failed", error);
    lotsPage = { items: [], total: 0, page: 1, pageSize: 50 };
  }

  const sanitizedLots = lotsPage.items.flatMap((lot) => {
    try {
      return [JSON.parse(JSON.stringify(serializeLotForRole(lot, false)))] as ReturnType<
        typeof serializeLotForRole
      >[];
    } catch (error) {
      console.error("[inwarded-lots] serialize failed", lot.id, error);
      return [];
    }
  });

  return (
    <AccountsInwardedLotsList
      initialLots={sanitizedLots}
      initialTotal={lotsPage.total}
      initialPage={lotsPage.page}
      initialPageSize={lotsPage.pageSize}
    />
  );
}
