/**
 * One-time local fix: release serials that were hard-booked onto a PI at approve-booking.
 * Keeps BOOKED only when the serial is already on a non-cancelled DC.
 */
import { DispatchStatus, PrismaClient, SerialStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const activeStatuses: DispatchStatus[] = [
    DispatchStatus.DRAFT,
    DispatchStatus.DISPATCHED,
    DispatchStatus.CANCEL_PENDING,
  ];

  const booked = await prisma.inventorySerial.findMany({
    where: { status: SerialStatus.BOOKED },
    select: {
      id: true,
      serialNumber: true,
      dispatchLineSerials: {
        where: { line: { dispatch: { status: { in: activeStatuses } } } },
        select: { id: true },
      },
    },
  });

  const toRelease = booked.filter((row) => row.dispatchLineSerials.length === 0);
  console.log(`BOOKED total: ${booked.length}; releasing: ${toRelease.length}`);

  if (toRelease.length === 0) return;

  const ids = toRelease.map((row) => row.id);
  await prisma.$transaction([
    prisma.proformaInvoiceSerial.deleteMany({ where: { serialId: { in: ids } } }),
    prisma.inventorySerial.updateMany({
      where: { id: { in: ids } },
      data: { status: SerialStatus.AVAILABLE },
    }),
  ]);

  console.log(
    "Released:",
    toRelease.map((row) => row.serialNumber).slice(0, 20),
    toRelease.length > 20 ? `... (+${toRelease.length - 20} more)` : "",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
