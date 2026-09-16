import {
  TaskLinkedRecordType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type LinkedRecordRef = {
  type: TaskLinkedRecordType;
  id: string;
  label: string;
  href: string;
  companyId: string | null;
};

export const LINKED_RECORD_LABELS: Record<TaskLinkedRecordType, string> = {
  CUSTOMER: "Customer",
  PROJECT_ENQUIRY: "Lead / Enquiry",
  QUOTATION: "Quotation",
  PI: "Proforma Invoice",
  PAYMENT: "Payment",
  INVOICE: "Invoice",
  PROJECT: "Project",
  SERVICE_COMPLAINT: "Service Complaint",
  PURCHASE_REQUEST: "Purchase Request",
  INVENTORY_LOT: "Inventory Lot",
  INVENTORY_AUDIT: "Inventory Audit",
  BANK_TRANSACTION: "Bank Transaction",
};

export function normalizeLinkedRecordType(
  value: string | null | undefined,
): TaskLinkedRecordType | null {
  if (!value) return null;
  if (value === "LEAD") return TaskLinkedRecordType.PROJECT_ENQUIRY;
  if (value === "INVENTORY") return TaskLinkedRecordType.INVENTORY_LOT;
  return (Object.values(TaskLinkedRecordType) as string[]).includes(value)
    ? (value as TaskLinkedRecordType)
    : null;
}

export async function resolveLinkedRecord(
  client: DbClient,
  type: TaskLinkedRecordType,
  id: string,
): Promise<LinkedRecordRef | null> {
  switch (type) {
    case TaskLinkedRecordType.CUSTOMER: {
      const record = await client.customer.findUnique({
        where: { id },
        select: { id: true, customerName: true, customerCode: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: `${record.customerName} (${record.customerCode})`,
        href: `/sales/customers/${record.id}`,
        companyId: null,
      };
    }
    case TaskLinkedRecordType.PROJECT_ENQUIRY: {
      const record = await client.projectEnquiry.findUnique({
        where: { id },
        select: { id: true, enquiryNo: true, customerName: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: `${record.enquiryNo} · ${record.customerName}`,
        href: `/projects/enquiries/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.QUOTATION: {
      const record = await client.quotation.findUnique({
        where: { id },
        select: { id: true, quotationNo: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.quotationNo,
        href: `/sales/quotations/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.PI: {
      const record = await client.proformaInvoice.findUnique({
        where: { id },
        select: { id: true, piNo: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.piNo,
        href: `/sales/proforma-invoices/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.PAYMENT: {
      const record = await client.payment.findUnique({
        where: { id },
        select: {
          id: true,
          referenceNo: true,
          companyId: true,
          proformaInvoice: { select: { piNo: true } },
        },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.referenceNo
          ? `Payment ${record.referenceNo}`
          : `Payment for ${record.proformaInvoice.piNo}`,
        href: `/accounts/payments?paymentId=${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.INVOICE: {
      const record = await client.invoiceHandover.findUnique({
        where: { id },
        select: { id: true, invoiceNumber: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.invoiceNumber ?? "Invoice handover",
        href: "/accounts/invoice-queue",
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.PROJECT: {
      const record = await client.project.findUnique({
        where: { id },
        select: { id: true, projectNo: true, customerName: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: `${record.projectNo} · ${record.customerName}`,
        href: `/projects/execution/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.SERVICE_COMPLAINT: {
      const record = await client.serviceRequest.findUnique({
        where: { id },
        select: { id: true, serviceRequestNumber: true, customerName: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: `${record.serviceRequestNumber} · ${record.customerName}`,
        href: `/service/requests/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.PURCHASE_REQUEST: {
      const record = await client.purchaseRequest.findUnique({
        where: { id },
        select: { id: true, requestNumber: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.requestNumber,
        href: `/purchase/requests/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.INVENTORY_LOT: {
      const record = await client.inventoryLot.findUnique({
        where: { id },
        select: { id: true, lotNumber: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.lotNumber,
        href: `/inventory?lotId=${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.INVENTORY_AUDIT: {
      const record = await client.inventoryDailyAudit.findUnique({
        where: { id },
        select: { id: true, auditNumber: true, companyId: true },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.auditNumber,
        href: `/inventory/audits/daily/${record.id}`,
        companyId: record.companyId,
      };
    }
    case TaskLinkedRecordType.BANK_TRANSACTION: {
      const record = await client.bankTransaction.findUnique({
        where: { id },
        select: {
          id: true,
          paymentCode: true,
          description: true,
          bankAccount: { select: { companyId: true } },
        },
      });
      if (!record) return null;
      return {
        type,
        id: record.id,
        label: record.paymentCode
          ? `Bank ${record.paymentCode}`
          : record.description.slice(0, 80),
        href: `/banking/transactions?transactionId=${record.id}`,
        companyId: record.bankAccount.companyId,
      };
    }
    default:
      return null;
  }
}

export async function assertLinkedRecordAccessible(
  client: DbClient,
  type: TaskLinkedRecordType,
  id: string,
  accessibleCompanyIds: string[],
): Promise<LinkedRecordRef> {
  const record = await resolveLinkedRecord(client, type, id);
  if (!record) {
    throw new Error("LINKED_RECORD_NOT_FOUND");
  }
  if (record.companyId && !accessibleCompanyIds.includes(record.companyId)) {
    throw new Error("LINKED_RECORD_FORBIDDEN");
  }
  return record;
}
