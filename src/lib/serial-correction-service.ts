import { Prisma, PrismaClient, SerialStatus } from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";

/** Statuses that hold a serial number "live" (matches the live-uniqueness index). */
const LIVE_SERIAL_STATUSES: SerialStatus[] = [
  SerialStatus.AVAILABLE,
  SerialStatus.BOOKED,
  SerialStatus.DAMAGED,
  SerialStatus.DAMAGE_PENDING,
];

/**
 * Replaces a wrongly entered serial number with the correct one.
 * Only the serial text changes; the serial keeps its id, lot, product and warehouse.
 * Allowed only while the serial is AVAILABLE (not dispatched, booked or damaged).
 * Callers must enforce Super Admin permission.
 */
export async function correctInwardedSerialNumber(
  prisma: PrismaClient,
  input: {
    companyId: string;
    serialId: string;
    newSerialNumber: string;
    updatedById: string;
  },
) {
  const newSerialNumber = input.newSerialNumber.trim();
  if (!newSerialNumber) throw new Error("SERIAL_REQUIRED");

  const serial = await prisma.inventorySerial.findFirst({
    where: { id: input.serialId, lot: { companyId: input.companyId } },
    include: { lot: { select: { id: true, lotNumber: true } } },
  });
  if (!serial) throw new Error("NOT_FOUND");

  if (serial.status !== SerialStatus.AVAILABLE) {
    throw new Error("SERIAL_NOT_CORRECTABLE");
  }

  if (serial.serialNumber === newSerialNumber) throw new Error("NO_CHANGES");

  const duplicate = await prisma.inventorySerial.findFirst({
    where: {
      serialNumber: newSerialNumber,
      status: { in: LIVE_SERIAL_STATUSES },
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("DUPLICATE_SERIAL");

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.inventorySerial.update({
        where: { id: serial.id },
        data: { serialNumber: newSerialNumber },
      });

      await writeAuditLogTx(tx, {
        tableName: "inventory_serials",
        recordId: serial.id,
        action: "UPDATE",
        performedBy: input.updatedById,
        companyId: input.companyId,
        reference: serial.lot.lotNumber,
        oldValue: { serialNumber: serial.serialNumber },
        newValue: { serialNumber: newSerialNumber },
      });

      return updated;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("DUPLICATE_SERIAL");
    }
    throw error;
  }
}
