import {
  BankPaymentAllocationStatus,
  BankTransactionAssignmentStatus,
  type PrismaClient,
  type ReceivedInAccount,
} from "@prisma/client";
import { ensurePaymentCodesForCredits } from "@/lib/bank-payment-code";
import { ISE_COMPANY_CODE } from "@/lib/company-scope";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { defaultPaymentsDateRange } from "@/lib/proforma-invoices";
import { isPcmCompany } from "@/lib/quotation-warnings";

/** Banks combined in the Sales daily view per entity. */
export function salesReceiptBanksForCompany(company: {
  code: string | null;
  name?: string | null;
}): ReceivedInAccount[] {
  if (company.code?.toUpperCase() === ISE_COMPANY_CODE) {
    return ["SBI", "HDFC", "ICICI"];
  }
  if (isPcmCompany({ id: "x", code: company.code, name: company.name ?? "" })) {
    return ["SBI", "HDFC"];
  }
  // Practice / other: show all configured brands on that company.
  return ["SBI", "HDFC", "ICICI"];
}

export function salesAvailabilityLabel(
  status: BankTransactionAssignmentStatus,
): "Available" | "Partially Used" | "Fully Used" | "Review" {
  switch (status) {
    case "UNASSIGNED":
      return "Available";
    case "PARTIALLY_ASSIGNED":
      return "Partially Used";
    case "FULLY_ASSIGNED":
      return "Fully Used";
    case "MANUAL_REVIEW":
    case "NON_CUSTOMER_PAYMENT":
    default:
      return "Review";
  }
}

export type SalesDailyReceiptRow = {
  id: string;
  paymentCode: string;
  transactionDate: string;
  description: string;
  referenceNumber: string | null;
  bankName: string;
  receivedInAccount: ReceivedInAccount;
  accountNumberMasked: string;
  amount: number;
  availableAmount: number;
  assignmentStatus: BankTransactionAssignmentStatus;
  availabilityLabel: ReturnType<typeof salesAvailabilityLabel>;
};

export type SalesDailyReceiptGroup = {
  date: string;
  items: SalesDailyReceiptRow[];
  dayTotal: number;
};

export async function listSalesDailyReceipts(
  db: PrismaClient,
  input: {
    companyId: string;
    userRoles: string[];
    userCompanyIds: string[];
    dateFrom?: string;
    dateTo?: string;
  },
) {
  if (!assertCompanyAccess(input.userRoles, input.userCompanyIds, input.companyId)) {
    throw new Error("FORBIDDEN_COMPANY");
  }

  const company = await db.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { id: true, code: true, name: true },
  });

  const banks = salesReceiptBanksForCompany(company);
  const defaults = defaultPaymentsDateRange();
  const dateFrom = input.dateFrom?.trim() || defaults.dateFrom;
  const dateTo = input.dateTo?.trim() || defaults.dateTo;

  const accounts = await db.bankAccount.findMany({
    where: {
      companyId: company.id,
      isActive: true,
      visibleToSales: true,
      receivedInAccount: { in: banks },
    },
    select: { id: true, bankName: true, receivedInAccount: true, accountNumberMasked: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return {
      company: { id: company.id, code: company.code, name: company.name },
      banks,
      visibleAccounts: [] as Array<{
        id: string;
        bankName: string;
        receivedInAccount: ReceivedInAccount;
        accountNumberMasked: string;
      }>,
      dateFrom,
      dateTo,
      groups: [] as SalesDailyReceiptGroup[],
      totalAmount: 0,
    };
  }

  const rows = await db.bankTransaction.findMany({
    where: {
      bankAccountId: { in: accountIds },
      creditAmount: { gt: 0 },
      // Sales view: credit / received money only — never debits.
      transactionDate: {
        gte: new Date(`${dateFrom}T00:00:00.000Z`),
        lte: new Date(`${dateTo}T00:00:00.000Z`),
      },
    },
    include: {
      bankAccount: {
        select: {
          bankName: true,
          accountNumberMasked: true,
          receivedInAccount: true,
        },
      },
      allocations: {
        where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        select: { allocatedAmount: true },
      },
    },
    orderBy: [{ transactionDate: "desc" }, { statementSequence: "desc" }],
    take: 500,
  });

  await ensurePaymentCodesForCredits(
    db,
    rows.filter((row) => !row.paymentCode).map((row) => row.id),
  );

  const refreshed = rows.some((row) => !row.paymentCode)
    ? await db.bankTransaction.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        include: {
          bankAccount: {
            select: {
              bankName: true,
              accountNumberMasked: true,
              receivedInAccount: true,
            },
          },
          allocations: {
            where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
            select: { allocatedAmount: true },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { statementSequence: "desc" }],
      })
    : rows;

  const items: SalesDailyReceiptRow[] = refreshed
    .filter((row) => Boolean(row.paymentCode))
    .map((row) => {
    const amount = Number(row.creditAmount);
    const allocated = row.allocations.reduce((s, a) => s + Number(a.allocatedAmount), 0);
    const availableAmount = Math.max(0, amount - allocated);
    return {
      id: row.id,
      paymentCode: row.paymentCode as string,
      transactionDate: row.transactionDate.toISOString().slice(0, 10),
      description: row.description,
      referenceNumber: row.referenceNumber,
      bankName: row.bankAccount.bankName,
      receivedInAccount: row.bankAccount.receivedInAccount,
      accountNumberMasked: row.bankAccount.accountNumberMasked,
      amount,
      availableAmount,
      assignmentStatus: row.assignmentStatus,
      availabilityLabel: salesAvailabilityLabel(row.assignmentStatus),
    };
  });

  const groupMap = new Map<string, SalesDailyReceiptRow[]>();
  for (const item of items) {
    const list = groupMap.get(item.transactionDate) ?? [];
    list.push(item);
    groupMap.set(item.transactionDate, list);
  }

  const groups: SalesDailyReceiptGroup[] = [...groupMap.entries()].map(([date, dayItems]) => ({
    date,
    items: dayItems,
    dayTotal: dayItems.reduce((s, i) => s + i.amount, 0),
  }));

  return {
    company: { id: company.id, code: company.code, name: company.name },
    banks,
    visibleAccounts: accounts.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      receivedInAccount: a.receivedInAccount,
      accountNumberMasked: a.accountNumberMasked,
    })),
    dateFrom,
    dateTo,
    groups,
    totalAmount: items.reduce((s, i) => s + i.amount, 0),
  };
}
