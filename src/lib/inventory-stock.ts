import {
  LotStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  decimalToNumber,
  emptyStockSummary,
  pendingIncomingQuantity,
  type StockSummary,
} from "@/lib/inventory";

/** Physical on-hand stock (no project reservation adjustments). */
export async function getPhysicalWarehouseStockForProduct(
  prisma: PrismaClient,
  companyId: string,
  productId: string,
  warehouseId: string,
): Promise<StockSummary> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return emptyStockSummary();

  const lots = await prisma.inventoryLot.findMany({
    where: { companyId, warehouseId, productId },
  });

  let incomingStock = 0;
  let nonSerialAvailable = 0;
  let nonSerialDamaged = 0;

  for (const lot of lots) {
    const quantity = decimalToNumber(lot.quantity);
    const received = decimalToNumber(lot.receivedQuantity);
    const damaged = decimalToNumber(lot.damagedQuantity);

    if (lot.status === LotStatus.INCOMING) {
      incomingStock += pendingIncomingQuantity({
        quantity,
        receivedQuantity: received,
        damagedQuantity: damaged,
      });
    }

    if (!product.serialTracking) {
      nonSerialAvailable += Math.max(0, received - damaged);
      nonSerialDamaged += damaged;
    }
  }

  if (product.serialTracking) {
    const [availableCount, bookedCount, damagedCount] = await Promise.all([
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.AVAILABLE,
          lot: { companyId },
        },
      }),
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.BOOKED,
          lot: { companyId },
        },
      }),
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.DAMAGED,
          lot: { companyId },
        },
      }),
    ]);

    return {
      availableStock: availableCount,
      incomingStock,
      bookedStock: bookedCount,
      damagedStock: damagedCount,
      committedStock: 0,
    };
  }

  return {
    availableStock: nonSerialAvailable,
    incomingStock,
    bookedStock: 0,
    damagedStock: nonSerialDamaged,
    committedStock: 0,
  };
}
