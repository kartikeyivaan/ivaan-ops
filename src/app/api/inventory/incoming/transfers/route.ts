import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decimalToNumber } from "@/lib/inventory";
import {
  canReceiveTransfer,
  canViewTransferSerials,
  canViewTransfers,
} from "@/lib/transfer-permissions";
import {
  listPendingIncomingTransfers,
  serializeTransferForRole,
} from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const transfers = await listPendingIncomingTransfers(prisma, companyId);
  const includeSerials = canViewTransferSerials(session.user.roles);

  const warehouseIds = [
    ...new Set(transfers.flatMap((transfer) => [transfer.fromWarehouseId, transfer.toWarehouseId])),
  ];
  const warehouses = warehouseIds.length
    ? await prisma.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true },
      })
    : [];
  const warehouseNameById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));

  const items = transfers.map((transfer) => {
    const pendingQty = transfer.lines.reduce(
      (sum, line) => sum + (decimalToNumber(line.qty) - decimalToNumber(line.receivedQty)),
      0,
    );

    return {
      transfer: serializeTransferForRole(transfer, includeSerials),
      fromWarehouseName: warehouseNameById.get(transfer.fromWarehouseId) ?? "—",
      toWarehouseName: warehouseNameById.get(transfer.toWarehouseId) ?? "—",
      pendingQty,
    };
  });

  return NextResponse.json({
    items,
    canReceive: canReceiveTransfer(session.user.roles),
  });
}
