import type { Prisma, PrismaClient } from "@prisma/client";

export const LETTER_DOCUMENT_TYPE = "LETTER";

export function formatLetterSerialNumber(
  companyCode: string,
  financialYear: string,
  sequenceNumber: number,
): string {
  return `${companyCode}-LET-${financialYear}-${String(sequenceNumber).padStart(5, "0")}`;
}

/** April–March FY from a date-only UTC value, e.g. 2026-04-10 → 26-27. */
export function getLetterFinancialYear(date: Date): string {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

export async function allocateLetterSequence(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  financialYear: string,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ last_sequence: number }>>`
    INSERT INTO document_sequences (id, company_id, document_type, financial_year, last_sequence)
    VALUES (gen_random_uuid(), ${companyId}::uuid, ${LETTER_DOCUMENT_TYPE}, ${financialYear}, 1)
    ON CONFLICT (company_id, document_type, financial_year)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence
  `;

  const sequence = rows[0]?.last_sequence;
  if (!sequence || sequence < 1) {
    throw new Error("LETTER_SEQUENCE_FAILED");
  }
  return sequence;
}
