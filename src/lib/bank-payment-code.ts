import { randomInt } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Uppercase alphanumeric alphabet excluding ambiguous 0/O/1/I. */
const PAYMENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAYMENT_CODE_LENGTH = 6;

type Db = PrismaClient | Prisma.TransactionClient;

export function generatePaymentCodeCandidate(length = PAYMENT_CODE_LENGTH): string {
  let code = "P";
  for (let i = 1; i < length; i += 1) {
    code += PAYMENT_CODE_ALPHABET[randomInt(PAYMENT_CODE_ALPHABET.length)]!;
  }
  return code;
}

export function isValidPaymentCodeFormat(code: string): boolean {
  return /^P[A-HJ-NP-Z2-9]{5}$/.test(code);
}

/**
 * Collision-safe unique payment code. Retries on unique constraint conflicts.
 * Codes never embed bank account numbers or other sensitive data.
 */
export async function allocateUniquePaymentCode(
  db: Db,
  maxAttempts = 24,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generatePaymentCodeCandidate();
    const existing = await db.bankTransaction.findUnique({
      where: { paymentCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("PAYMENT_CODE_COLLISION");
}

/** Assign payment codes to credit transactions that are missing one. */
export async function ensurePaymentCodesForCredits(
  db: Db,
  transactionIds: string[],
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const missing = await db.bankTransaction.findMany({
    where: {
      id: { in: transactionIds },
      paymentCode: null,
      creditAmount: { gt: 0 },
    },
    select: { id: true },
  });

  let updated = 0;
  for (const row of missing) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const paymentCode = await allocateUniquePaymentCode(db);
      try {
        await db.bankTransaction.update({
          where: { id: row.id },
          data: { paymentCode },
        });
        updated += 1;
        break;
      } catch (err) {
        if (
          err instanceof Error &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }
  }
  return updated;
}
