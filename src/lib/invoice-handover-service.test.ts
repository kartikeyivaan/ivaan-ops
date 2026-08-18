import { describe, expect, it, vi } from "vitest";
import { DocumentationStatus, InvoiceHandoverStatus, type PrismaClient } from "@prisma/client";
import { recordInvoice } from "@/lib/invoice-handover-service";

function mockClient() {
  const client = {
    $transaction: vi.fn(async (operation) => operation(client)),
    invoiceHandover: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }) => ({ id: "handover-1", ...data })),
    },
    documentationRecord: {
      findUnique: vi.fn(),
      create: vi.fn(async ({ data }) => ({ id: "doc-1", ...data })),
    },
    documentationStatusHistory: {
      create: vi.fn(async ({ data }) => ({ id: "history-1", ...data })),
    },
  };
  return client as unknown as PrismaClient;
}

const handover = {
  id: "handover-1",
  dispatchId: "dispatch-1",
  companyId: "company-1",
  customerId: "customer-1",
  status: InvoiceHandoverStatus.PENDING_INVOICE,
};

describe("recordInvoice documentation attach", () => {
  it("creates documentation when none exists yet", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(handover as never);
    vi.mocked(client.documentationRecord.findUnique).mockResolvedValue(null);

    await recordInvoice(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      invoiceNumber: "INV-100",
      invoiceDate: new Date("2026-08-18"),
      recordedById: "user-1",
    });

    expect(client.documentationRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        dispatchId: "dispatch-1",
        invoiceHandoverId: "handover-1",
        status: DocumentationStatus.PENDING,
      }),
    }));
    expect(client.documentationStatusHistory.create).not.toHaveBeenCalled();
  });

  it("attaches the invoice to an early DCR record without resetting status", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(handover as never);
    vi.mocked(client.documentationRecord.findUnique).mockResolvedValue({
      id: "doc-1",
      status: DocumentationStatus.DCR_ISSUED,
    } as never);

    await recordInvoice(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      invoiceNumber: "INV-100",
      invoiceDate: new Date("2026-08-18"),
      recordedById: "user-1",
    });

    expect(client.documentationRecord.create).not.toHaveBeenCalled();
    expect(client.documentationStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentationRecordId: "doc-1",
        fromStatus: DocumentationStatus.DCR_ISSUED,
        toStatus: DocumentationStatus.DCR_ISSUED,
        remarks: "Invoice recorded",
        changedById: "user-1",
      }),
    });
  });
});
