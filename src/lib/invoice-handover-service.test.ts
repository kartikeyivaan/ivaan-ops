import { describe, expect, it, vi } from "vitest";
import {
  DispatchStatus,
  DocumentationStatus,
  InvoiceHandoverStatus,
  PiCreditStatus,
  type PrismaClient,
} from "@prisma/client";
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

function handoverWithProducts(
  lines: { displayName: string }[],
  creditStatus: PiCreditStatus = PiCreditStatus.NONE,
) {
  return {
    id: "handover-1",
    dispatchId: "dispatch-1",
    companyId: "company-1",
    customerId: "customer-1",
    status: InvoiceHandoverStatus.PENDING_INVOICE,
    dispatch: {
      status: DispatchStatus.DISPATCHED,
      dcNo: "DC-1",
      lines: lines.map((line) => ({ product: { displayName: line.displayName } })),
      proformaInvoice: { creditStatus },
    },
  };
}

const dcrHandover = handoverWithProducts([{ displayName: "Waaree 590W DCR" }]);

describe("recordInvoice documentation attach", () => {
  it("creates PENDING documentation when DCR panels exist and credit is clear", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(dcrHandover as never);
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

  it("creates NOT_REQUIRED documentation when dispatch has no DCR panel lines", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(
      handoverWithProducts([{ displayName: "Modules - Waaree - TOPCon N-DCR - 615 Wp" }]) as never,
    );
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
        status: DocumentationStatus.NOT_REQUIRED,
        completedById: "user-1",
      }),
    }));
  });

  it("creates NOT_REQUIRED documentation when PI is on approved credit", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(
      handoverWithProducts([{ displayName: "Waaree 590W DCR" }], PiCreditStatus.APPROVED) as never,
    );
    vi.mocked(client.documentationRecord.findUnique).mockResolvedValue(null);

    await recordInvoice(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      invoiceNumber: "INV-100",
      invoiceDate: new Date("2026-08-18"),
      recordedById: "user-1",
    });

    expect(client.documentationRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DocumentationStatus.NOT_REQUIRED }),
    }));
  });

  it("does not reopen documentation when DCR was already issued before invoicing", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(dcrHandover as never);
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
    expect(client.documentationStatusHistory.create).not.toHaveBeenCalled();
  });

  it("does not reopen documentation when it was marked not required before invoicing", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(dcrHandover as never);
    vi.mocked(client.documentationRecord.findUnique).mockResolvedValue({
      id: "doc-1",
      status: DocumentationStatus.NOT_REQUIRED,
    } as never);

    await recordInvoice(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      invoiceNumber: "INV-100",
      invoiceDate: new Date("2026-08-18"),
      recordedById: "user-1",
    });

    expect(client.documentationRecord.create).not.toHaveBeenCalled();
    expect(client.documentationStatusHistory.create).not.toHaveBeenCalled();
  });

  it("leaves in-progress early documentation in the queue without resetting status", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(dcrHandover as never);
    vi.mocked(client.documentationRecord.findUnique).mockResolvedValue({
      id: "doc-1",
      status: DocumentationStatus.PENDING,
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
        fromStatus: DocumentationStatus.PENDING,
        toStatus: DocumentationStatus.PENDING,
        remarks: "Invoice recorded",
        changedById: "user-1",
      }),
    });
  });

  it("rejects invoice recording when the delivery challan was cancelled", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      ...dcrHandover,
      dispatch: {
        ...dcrHandover.dispatch,
        status: DispatchStatus.CANCELLED,
      },
    } as never);

    await expect(
      recordInvoice(client, {
        companyId: "company-1",
        handoverId: "handover-1",
        invoiceNumber: "INV-100",
        invoiceDate: new Date("2026-08-18"),
        recordedById: "user-1",
      }),
    ).rejects.toThrow("DISPATCH_CANCELLED");

    expect(client.invoiceHandover.update).not.toHaveBeenCalled();
    expect(client.documentationRecord.create).not.toHaveBeenCalled();
  });
});
