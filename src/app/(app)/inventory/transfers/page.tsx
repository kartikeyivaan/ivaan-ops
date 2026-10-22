import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo-mode";
import {
  canCreateTransfer,
  canViewTransfers,
} from "@/lib/transfer-permissions";
import { getInterCompanyTransferSummary } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { TransferSummary } from "@/components/inventory/transfer-summary";

export default async function TransfersPage() {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    redirect("/dashboard");
  }

  const demo = isDemoUser(session);
  const summary = demo ? [] : await getInterCompanyTransferSummary(prisma);

  return (
    <TransferSummary
      rows={JSON.parse(JSON.stringify(summary))}
      canCreate={!demo && canCreateTransfer(session.user.roles)}
      hideLiveFirmLabels={demo}
    />
  );
}
