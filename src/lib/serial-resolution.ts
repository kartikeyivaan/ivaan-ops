import { type PrismaClient } from "@prisma/client";
import { normalizeSerialNumber } from "@/lib/inventory";

/**
 * Serials such as `WSP3300i WPS033260720291` contain a space, so a pasted line
 * is ambiguous: it may be one serial or a space-separated list. Stock is the
 * authority, so a whole-line match always wins and tokens are only tried when
 * the line matches nothing. Lines without a space cost no extra query.
 */
export async function resolveStoredSerials(
  prisma: PrismaClient,
  rawSerials: string[],
): Promise<string[]> {
  const resolved: string[] = [];

  for (const raw of rawSerials) {
    const serialNumber = normalizeSerialNumber(raw);
    if (!serialNumber) continue;

    if (!/\s/.test(serialNumber)) {
      resolved.push(serialNumber);
      continue;
    }

    const stored = await prisma.inventorySerial.findFirst({
      where: { serialNumber },
      select: { id: true },
    });
    resolved.push(...(stored ? [serialNumber] : serialNumber.split(/\s+/)));
  }

  return resolved;
}
