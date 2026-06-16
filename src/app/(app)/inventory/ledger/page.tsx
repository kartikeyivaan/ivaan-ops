import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewInventory } from "@/lib/inventory-permissions";
import { listLedger } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { LedgerList } from "@/components/inventory/ledger-list";

export default async function InventoryLedgerPage() {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const entries = await listLedger(prisma, companyId, {});

  return (
    <LedgerList
      entries={entries.map((entry) => ({
        ...entry,
        qty: Number(entry.qty),
        createdAt: entry.createdAt.toISOString(),
      }))}
    />
  );
}
