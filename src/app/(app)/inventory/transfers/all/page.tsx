import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canCreateTransfer,
  canViewTransfers,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import { listTransfers, serializeTransferForRole } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { TransferList } from "@/components/inventory/transfer-list";

export default async function AllTransfersPage() {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const includeSerials = canViewTransferSerials(session.user.roles);
  const transfers = await listTransfers(prisma, companyId, {});

  return (
    <TransferList
      initialTransfers={transfers.map((transfer) =>
        serializeTransferForRole(transfer, includeSerials),
      )}
      activeCompanyId={companyId}
      canCreate={canCreateTransfer(session.user.roles)}
    />
  );
}
