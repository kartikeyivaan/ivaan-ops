import {
  PaymentMode,
  Prisma,
  ReceivedInAccount,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { defaultPaymentsDateRange, toDateOnly } from "@/lib/proforma-invoices";

export type ListPaymentsFilters = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type PaymentListItem = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  receivedInAccount: ReceivedInAccount | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    customerName: string;
    customerCode: string;
  };
  proformaInvoice: {
    id: string;
    piNo: string;
    totalValue: number;
  };
  recordedBy: {
    id: string;
    name: string;
  };
};

function defaultDateFrom(): Date {
  return toDateOnly(new Date(defaultPaymentsDateRange().dateFrom));
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const date = toDateOnly(new Date(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function matchingPaymentModes(q: string): PaymentMode[] {
  const needle = q.toLowerCase();
  return (Object.values(PaymentMode) as PaymentMode[]).filter((mode) =>
    mode.toLowerCase().replaceAll("_", " ").includes(needle) ||
    mode.toLowerCase().includes(needle),
  );
}

function matchingReceivedAccounts(q: string): ReceivedInAccount[] {
  const needle = q.toUpperCase();
  return (Object.values(ReceivedInAccount) as ReceivedInAccount[]).filter((account) =>
    account.includes(needle),
  );
}

function buildWhere(
  companyId: string,
  filters: ListPaymentsFilters,
): Prisma.PaymentWhereInput {
  const dateFrom = parseOptionalDate(filters.dateFrom) ?? defaultDateFrom();
  const dateTo = parseOptionalDate(filters.dateTo) ?? toDateOnly(new Date());

  const where: Prisma.PaymentWhereInput = {
    companyId,
    paymentDate: {
      gte: dateFrom,
      lte: dateTo,
    },
  };

  const q = filters.q?.trim();
  if (!q) return where;

  const or: Prisma.PaymentWhereInput[] = [
    { customer: { customerName: { contains: q, mode: "insensitive" } } },
    { customer: { customerCode: { contains: q, mode: "insensitive" } } },
    { proformaInvoice: { piNo: { contains: q, mode: "insensitive" } } },
    { referenceNo: { contains: q, mode: "insensitive" } },
    { notes: { contains: q, mode: "insensitive" } },
    { recordedBy: { name: { contains: q, mode: "insensitive" } } },
  ];

  const modes = matchingPaymentModes(q);
  if (modes.length) or.push({ paymentMode: { in: modes } });

  const accounts = matchingReceivedAccounts(q);
  if (accounts.length) or.push({ receivedInAccount: { in: accounts } });

  const amount = Number(q.replace(/[,₹\s]/g, ""));
  if (Number.isFinite(amount) && q.replace(/[,₹\s]/g, "").length > 0) {
    or.push({ amount });
  }

  where.OR = or;
  return where;
}

function serializePayment(
  payment: {
    id: string;
    amount: Prisma.Decimal;
    paymentDate: Date;
    paymentMode: PaymentMode;
    receivedInAccount: ReceivedInAccount | null;
    referenceNo: string | null;
    notes: string | null;
    createdAt: Date;
    customer: { id: string; customerName: string; customerCode: string };
    proformaInvoice: { id: string; piNo: string; totalValue: Prisma.Decimal };
    recordedBy: { id: string; name: string };
  },
): PaymentListItem {
  return {
    id: payment.id,
    amount: decimalToNumber(payment.amount),
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    paymentMode: payment.paymentMode,
    receivedInAccount: payment.receivedInAccount,
    referenceNo: payment.referenceNo,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    customer: payment.customer,
    proformaInvoice: {
      id: payment.proformaInvoice.id,
      piNo: payment.proformaInvoice.piNo,
      totalValue: decimalToNumber(payment.proformaInvoice.totalValue),
    },
    recordedBy: payment.recordedBy,
  };
}

export async function listPiPayments(
  prisma: PrismaClient,
  companyId: string,
  filters: ListPaymentsFilters = {},
): Promise<PaymentListItem[]> {
  const payments = await prisma.payment.findMany({
    where: buildWhere(companyId, filters),
    include: {
      customer: { select: { id: true, customerName: true, customerCode: true } },
      proformaInvoice: { select: { id: true, piNo: true, totalValue: true } },
      recordedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
  });

  return payments.map(serializePayment);
}
