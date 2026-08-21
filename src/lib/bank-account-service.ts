import type { BankAccount, Prisma, PrismaClient, ReceivedInAccount } from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";

type Db = PrismaClient | Prisma.TransactionClient;

export function maskBankAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  const visible = digits.slice(-4);
  if (!visible) return "****";
  const maskedLen = Math.max(4, digits.length - 4);
  return `${"*".repeat(maskedLen)}${visible}`;
}

export function serializeBankAccount(account: BankAccount & { company?: { id: string; code: string; name: string } }) {
  return {
    id: account.id,
    companyId: account.companyId,
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    accountNumberMasked: account.accountNumberMasked,
    ifscCode: account.ifscCode,
    currency: account.currency,
    receivedInAccount: account.receivedInAccount,
    isActive: account.isActive,
    visibleToSales: account.visibleToSales,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    company: account.company
      ? {
          id: account.company.id,
          code: account.company.code,
          name: account.company.name,
        }
      : undefined,
  };
}

export async function listBankAccounts(db: Db, companyId: string, options?: { includeInactive?: boolean }) {
  return db.bankAccount.findMany({
    where: {
      companyId,
      ...(options?.includeInactive ? {} : { isActive: true }),
    },
    include: {
      company: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ bankName: "asc" }, { accountName: "asc" }],
  });
}

export type CreateBankAccountInput = {
  companyId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode?: string | null;
  currency?: string;
  receivedInAccount: ReceivedInAccount;
  isActive?: boolean;
  visibleToSales?: boolean;
};

export async function createBankAccount(
  db: PrismaClient,
  input: CreateBankAccountInput,
  actorUserId: string,
) {
  const accountNumber = input.accountNumber.replace(/\s+/g, "").trim();
  const existing = await db.bankAccount.findUnique({ where: { accountNumber } });
  if (existing) {
    throw new Error("ACCOUNT_NUMBER_EXISTS");
  }

  const account = await db.bankAccount.create({
    data: {
      companyId: input.companyId,
      bankName: input.bankName.trim(),
      accountName: input.accountName.trim(),
      accountNumber,
      accountNumberMasked: maskBankAccountNumber(accountNumber),
      ifscCode: input.ifscCode?.trim() || null,
      currency: input.currency?.trim() || "INR",
      receivedInAccount: input.receivedInAccount,
      isActive: input.isActive ?? true,
      visibleToSales: input.visibleToSales ?? true,
    },
    include: {
      company: { select: { id: true, code: true, name: true } },
    },
  });

  await writeAuditLog({
    tableName: "bank_accounts",
    recordId: account.id,
    action: "CREATE",
    performedBy: actorUserId,
    companyId: account.companyId,
    newValue: {
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumberMasked: account.accountNumberMasked,
      ifscCode: account.ifscCode,
      receivedInAccount: account.receivedInAccount,
      isActive: account.isActive,
      visibleToSales: account.visibleToSales,
    },
  });

  return account;
}

export type UpdateBankAccountInput = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscCode?: string | null;
  currency?: string;
  receivedInAccount?: ReceivedInAccount;
  isActive?: boolean;
  visibleToSales?: boolean;
};

export async function updateBankAccount(
  db: PrismaClient,
  accountId: string,
  input: UpdateBankAccountInput,
  actorUserId: string,
) {
  const existing = await db.bankAccount.findUnique({ where: { id: accountId } });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  let nextAccountNumber = existing.accountNumber;
  if (input.accountNumber !== undefined) {
    nextAccountNumber = input.accountNumber.replace(/\s+/g, "").trim();
    if (nextAccountNumber !== existing.accountNumber) {
      const clash = await db.bankAccount.findUnique({
        where: { accountNumber: nextAccountNumber },
      });
      if (clash) {
        throw new Error("ACCOUNT_NUMBER_EXISTS");
      }
    }
  }

  const account = await db.$transaction(async (tx) => {
    const updated = await tx.bankAccount.update({
      where: { id: accountId },
      data: {
        ...(input.bankName !== undefined ? { bankName: input.bankName.trim() } : {}),
        ...(input.accountName !== undefined ? { accountName: input.accountName.trim() } : {}),
        ...(input.accountNumber !== undefined
          ? {
              accountNumber: nextAccountNumber,
              accountNumberMasked: maskBankAccountNumber(nextAccountNumber),
            }
          : {}),
        ...(input.ifscCode !== undefined ? { ifscCode: input.ifscCode?.trim() || null } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.trim() || "INR" } : {}),
        ...(input.receivedInAccount !== undefined
          ? { receivedInAccount: input.receivedInAccount }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.visibleToSales !== undefined ? { visibleToSales: input.visibleToSales } : {}),
      },
      include: {
        company: { select: { id: true, code: true, name: true } },
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "bank_accounts",
      recordId: updated.id,
      action: "UPDATE",
      performedBy: actorUserId,
      companyId: updated.companyId,
      oldValue: {
        bankName: existing.bankName,
        accountName: existing.accountName,
        accountNumberMasked: existing.accountNumberMasked,
        ifscCode: existing.ifscCode,
        receivedInAccount: existing.receivedInAccount,
        isActive: existing.isActive,
        visibleToSales: existing.visibleToSales,
      },
      newValue: {
        bankName: updated.bankName,
        accountName: updated.accountName,
        accountNumberMasked: updated.accountNumberMasked,
        ifscCode: updated.ifscCode,
        receivedInAccount: updated.receivedInAccount,
        isActive: updated.isActive,
        visibleToSales: updated.visibleToSales,
      },
      reason:
        input.visibleToSales !== undefined &&
        input.visibleToSales !== existing.visibleToSales
          ? input.visibleToSales
            ? "Show bank account to Sales"
            : "Hide bank account from Sales"
          : null,
    });

    return updated;
  });

  return account;
}
