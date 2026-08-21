import {
  BankPaymentAllocationStatus,
  BankTransactionAssignmentStatus,
  BankTransactionIssueStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { ISE_COMPANY_CODE } from "@/lib/company-scope";
import { toDateOnly } from "@/lib/proforma-invoices";
import { isPcmCompany } from "@/lib/quotation-warnings";

export type BankTransactionListFilters = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  bankAccountId?: string;
  receivedInAccount?: "SBI" | "HDFC" | "ICICI";
  direction?: "CREDIT" | "DEBIT" | "ALL";
  assignmentStatus?: BankTransactionAssignmentStatus;
  reconciliationStatus?: "OK" | "ISSUE" | "ALL";
  importId?: string;
  minAmount?: number;
  maxAmount?: number;
};

function parseDateOnly(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Sum available credit for unassigned / partially assigned buckets (pure). */
export function summarizeCreditAvailability(
  credits: Array<{
    creditAmount: number | { toString(): string };
    assignmentStatus: BankTransactionAssignmentStatus;
    allocations: Array<{ allocatedAmount: number | { toString(): string } }>;
  }>,
): { unassignedCreditAmount: number; partiallyAssignedCreditAmount: number } {
  let unassignedCreditAmount = 0;
  let partiallyAssignedCreditAmount = 0;
  for (const txn of credits) {
    const credit = Number(txn.creditAmount);
    const allocated = txn.allocations.reduce((s, a) => s + Number(a.allocatedAmount), 0);
    const available = Math.max(0, credit - allocated);
    if (txn.assignmentStatus === BankTransactionAssignmentStatus.UNASSIGNED) {
      unassignedCreditAmount += available;
    } else if (txn.assignmentStatus === BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED) {
      partiallyAssignedCreditAmount += available;
    }
  }
  return { unassignedCreditAmount, partiallyAssignedCreditAmount };
}

export function classifyCompanyForBankDashboard(company: {
  code: string | null;
  name?: string | null;
}): "ISE" | "PCM" | "OTHER" {
  if (company.code?.toUpperCase() === ISE_COMPANY_CODE) return "ISE";
  if (isPcmCompany({ id: "x", code: company.code, name: company.name ?? "" })) return "PCM";
  return "OTHER";
}

async function latestBalanceForAccount(
  db: PrismaClient,
  account: { id: string; bankName: string; accountNumberMasked: string },
) {
  const latest = await db.bankTransaction.findFirst({
    where: { bankAccountId: account.id },
    orderBy: [{ transactionDate: "desc" }, { statementSequence: "desc" }, { createdAt: "desc" }],
    select: { runningBalance: true, transactionDate: true },
  });
  return {
    bankAccountId: account.id,
    bankName: account.bankName,
    accountNumberMasked: account.accountNumberMasked,
    balance: latest ? Number(latest.runningBalance) : 0,
    asOf: latest ? latest.transactionDate.toISOString().slice(0, 10) : "—",
  };
}

async function sumLatestBalancesForCompany(db: PrismaClient, companyId: string): Promise<number> {
  const accounts = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, bankName: true, accountNumberMasked: true },
  });
  let total = 0;
  for (const account of accounts) {
    const row = await latestBalanceForAccount(db, account);
    total += row.balance;
  }
  return total;
}

export async function listBankTransactions(
  db: PrismaClient,
  companyId: string,
  filters: BankTransactionListFilters,
) {
  const dateFrom = parseDateOnly(filters.dateFrom);
  const dateTo = parseDateOnly(filters.dateTo);

  const where: Prisma.BankTransactionWhereInput = {
    bankAccount: {
      companyId,
      ...(filters.bankAccountId ? { id: filters.bankAccountId } : {}),
      ...(filters.receivedInAccount
        ? { receivedInAccount: filters.receivedInAccount }
        : {}),
    },
    ...(filters.assignmentStatus ? { assignmentStatus: filters.assignmentStatus } : {}),
    ...(filters.importId ? { sourceImportId: filters.importId } : {}),
    ...(dateFrom || dateTo
      ? {
          transactionDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  if (filters.direction === "CREDIT") {
    where.creditAmount = { gt: 0 };
  } else if (filters.direction === "DEBIT") {
    where.debitAmount = { gt: 0 };
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { referenceNumber: { contains: q, mode: "insensitive" } },
      { paymentCode: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    const amountFilter: Prisma.DecimalFilter = {};
    if (filters.minAmount !== undefined) amountFilter.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) amountFilter.lte = filters.maxAmount;
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [{ creditAmount: amountFilter }, { debitAmount: amountFilter }],
      },
    ];
  }

  const rows = await db.bankTransaction.findMany({
    where,
    include: {
      bankAccount: {
        select: {
          id: true,
          bankName: true,
          accountName: true,
          accountNumberMasked: true,
          receivedInAccount: true,
        },
      },
      allocations: {
        where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        select: {
          allocatedAmount: true,
          customerCompanyName: true,
          customerGstNumber: true,
          customer: { select: { id: true, customerName: true, gstNumber: true } },
        },
      },
      issues: {
        where: {
          status: {
            in: [BankTransactionIssueStatus.OPEN, BankTransactionIssueStatus.UNDER_REVIEW],
          },
        },
        select: { id: true, issueType: true, status: true },
      },
      sourceImport: {
        select: { id: true, originalFilename: true, uploadedAt: true },
      },
    },
    orderBy: [{ transactionDate: "desc" }, { statementSequence: "desc" }],
    take: 500,
  });

  const mapped = rows.map((row) => {
    const allocatedAmount = row.allocations.reduce(
      (sum, a) => sum + Number(a.allocatedAmount),
      0,
    );
    const credit = Number(row.creditAmount);
    const debit = Number(row.debitAmount);
    const availableAmount = Math.max(0, credit - allocatedAmount);
    const customers = row.allocations.map((a) => ({
      name: a.customerCompanyName || a.customer.customerName,
      gst: a.customerGstNumber || a.customer.gstNumber,
    }));
    const uniqueCustomers = Array.from(
      new Map(customers.map((c) => [`${c.name}|${c.gst}`, c])).values(),
    );
    const reconciliationStatus = row.issues.length > 0 ? ("ISSUE" as const) : ("OK" as const);

    return {
      id: row.id,
      transactionDate: row.transactionDate.toISOString().slice(0, 10),
      valueDate: row.valueDate ? row.valueDate.toISOString().slice(0, 10) : null,
      description: row.description,
      referenceNumber: row.referenceNumber,
      debitAmount: debit,
      creditAmount: credit,
      runningBalance: Number(row.runningBalance),
      statementSequence: row.statementSequence,
      paymentCode: row.paymentCode,
      assignmentStatus: row.assignmentStatus,
      allocatedAmount,
      availableAmount,
      customers: uniqueCustomers,
      reconciliationStatus,
      openIssueCount: row.issues.length,
      bankAccount: row.bankAccount,
      sourceImport: row.sourceImport
        ? {
            id: row.sourceImport.id,
            originalFilename: row.sourceImport.originalFilename,
            uploadedAt: row.sourceImport.uploadedAt.toISOString(),
          }
        : null,
    };
  });

  const filtered =
    filters.reconciliationStatus && filters.reconciliationStatus !== "ALL"
      ? mapped.filter((row) => row.reconciliationStatus === filters.reconciliationStatus)
      : mapped;

  return filtered;
}

export async function listBankStatementImports(db: PrismaClient, companyId: string) {
  return db.bankStatementImport.findMany({
    where: {
      OR: [
        { bankAccount: { companyId } },
        {
          bankAccountId: null,
          uploadedBy: { companies: { some: { companyId } } },
        },
      ],
    },
    include: {
      bankAccount: {
        select: {
          id: true,
          bankName: true,
          accountNumberMasked: true,
          receivedInAccount: true,
        },
      },
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
}

export function serializeBankImport(
  row: Awaited<ReturnType<typeof listBankStatementImports>>[number],
) {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    fileHash: row.fileHash,
    parserType: row.parserType,
    processingStatus: row.processingStatus,
    statementStartDate: row.statementStartDate
      ? row.statementStartDate.toISOString().slice(0, 10)
      : null,
    statementEndDate: row.statementEndDate
      ? row.statementEndDate.toISOString().slice(0, 10)
      : null,
    transactionsDetected: row.transactionsDetected,
    newTransactions: row.newTransactions,
    duplicatesDetected: row.duplicatesDetected,
    mismatchesDetected: row.mismatchesDetected,
    balanceIssuesDetected: row.balanceIssuesDetected,
    errorMessage: row.errorMessage,
    uploadedAt: row.uploadedAt.toISOString(),
    fileDeletedAt: row.fileDeletedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    bankAccount: row.bankAccount,
    uploadedBy: row.uploadedBy,
  };
}

export async function getBankingDashboard(db: PrismaClient, companyId: string) {
  const accounts = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, bankName: true, accountNumberMasked: true, receivedInAccount: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const latestBalances = [];
  let totalBalance = 0;
  for (const account of accounts) {
    const row = await latestBalanceForAccount(db, account);
    totalBalance += row.balance;
    latestBalances.push(row);
  }

  const credits =
    accountIds.length === 0
      ? []
      : await db.bankTransaction.findMany({
          where: {
            bankAccountId: { in: accountIds },
            creditAmount: { gt: 0 },
          },
          include: {
            allocations: {
              where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
              select: { allocatedAmount: true },
            },
          },
        });

  const { unassignedCreditAmount, partiallyAssignedCreditAmount } =
    summarizeCreditAvailability(credits);

  const companies = await db.company.findMany({
    select: { id: true, code: true, name: true },
  });
  const iseCompany = companies.find((c) => classifyCompanyForBankDashboard(c) === "ISE");
  const pcmCompany = companies.find((c) => classifyCompanyForBankDashboard(c) === "PCM");

  const [iseTotalBalance, pcmTotalBalance, unverifiedManualPayments, openIssues, recentImports, lastImport] =
    await Promise.all([
      iseCompany ? sumLatestBalancesForCompany(db, iseCompany.id) : Promise.resolve(0),
      pcmCompany ? sumLatestBalancesForCompany(db, pcmCompany.id) : Promise.resolve(0),
      db.payment.count({
        where: {
          companyId,
          verificationStatus: "MANUAL_UNVERIFIED",
        },
      }),
      accountIds.length === 0
        ? Promise.resolve(0)
        : db.bankTransactionIssue.count({
            where: {
              bankAccountId: { in: accountIds },
              status: {
                in: [BankTransactionIssueStatus.OPEN, BankTransactionIssueStatus.UNDER_REVIEW],
              },
            },
          }),
      listBankStatementImports(db, companyId).then((rows) =>
        rows.slice(0, 5).map(serializeBankImport),
      ),
      db.bankStatementImport.findFirst({
        where: {
          OR: [
            { bankAccount: { companyId } },
            { bankAccountId: null, uploadedBy: { companies: { some: { companyId } } } },
          ],
        },
        orderBy: { uploadedAt: "desc" },
        include: {
          bankAccount: {
            select: {
              id: true,
              bankName: true,
              accountNumberMasked: true,
              receivedInAccount: true,
            },
          },
          uploadedBy: { select: { id: true, name: true } },
        },
      }),
    ]);

  return {
    asOf: toDateOnly(new Date()).toISOString().slice(0, 10),
    totalBalance,
    iseTotalBalance,
    pcmTotalBalance,
    accountBalances: latestBalances,
    unassignedCreditAmount,
    partiallyAssignedCreditAmount,
    unverifiedManualPayments,
    openReconciliationIssues: openIssues,
    recentImports,
    lastImport: lastImport ? serializeBankImport(lastImport) : null,
  };
}
