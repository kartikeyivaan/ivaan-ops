import { describe, expect, it, vi } from "vitest";
import {
  DispatchStatus,
  DocumentationStatus,
  InvoiceHandoverStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  calculateDocumentationAgeing,
  countPendingInvoiceDocumentation,
  listPendingInvoiceDocumentation,
  markDispatchForDcr,
  validateDocumentationStatusInput,
} from "@/lib/documentation-service";

function mockClient() {
  const client = {
    $transaction: vi.fn(async (operation) => operation(client)),
    invoiceHandover: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    documentationRecord: {
      create: vi.fn(),
    },
  };
  return client as unknown as PrismaClient;
}

const pendingHandover = {
  id: "handover-1",
  dispatchId: "dispatch-1",
  companyId: "company-1",
  customerId: "customer-1",
  status: InvoiceHandoverStatus.PENDING_INVOICE,
  documentation: null,
  dispatch: { status: DispatchStatus.DISPATCHED },
};

describe("documentation status rules", () => {
  it("requires a reason when putting a record on hold", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.HOLD, {}))
      .toThrow("HOLD_REASON_REQUIRED");
  });

  it("requires a reason when sending a record for review", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.FOR_REVIEW, {}))
      .toThrow("REVIEW_REASON_REQUIRED");
  });

  it("accepts terminal statuses without reasons", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.DCR_ISSUED, {}))
      .not.toThrow();
  });

  it("allows DCR issued without an invoice number", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.DCR_ISSUED, {
      holdReason: null,
      reviewReason: null,
    })).not.toThrow();
  });
});

describe("documentation ageing", () => {
  it("counts complete elapsed calendar days", () => {
    expect(calculateDocumentationAgeing(
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-11T23:59:59.000Z"),
    )).toBe(10);
  });

  it("never returns negative ageing", () => {
    expect(calculateDocumentationAgeing(
      new Date("2026-07-11T00:00:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z"),
    )).toBe(0);
  });
});

describe("pending invoice documentation", () => {
  it("lists dispatched handovers that still need an invoice and have no documentation row", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findMany).mockResolvedValue([
      {
        id: "handover-1",
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        dispatch: {
          dcNo: "DC-1",
          dispatchDate: new Date("2026-08-10T00:00:00.000Z"),
          proformaInvoice: { piNo: "PI-1" },
        },
        customer: { customerName: "Acme", gstNumber: "GST1" },
      },
    ] as never);

    const rows = await listPendingInvoiceDocumentation(client, "company-1");

    expect(client.invoiceHandover.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: "company-1",
        status: {
          in: [InvoiceHandoverStatus.PENDING_INVOICE, InvoiceHandoverStatus.CORRECTION_REQUIRED],
        },
        documentation: { is: null },
        dispatch: { status: DispatchStatus.DISPATCHED },
      },
    }));
    expect(rows[0]?.id).toBe("handover-1");
    expect(rows[0]?.ageingDays).toBeGreaterThanOrEqual(0);
  });

  it("counts the same pending-invoice set", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.count).mockResolvedValue(3);

    await expect(countPendingInvoiceDocumentation(client, "company-1")).resolves.toBe(3);
    expect(client.invoiceHandover.count).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        status: {
          in: [InvoiceHandoverStatus.PENDING_INVOICE, InvoiceHandoverStatus.CORRECTION_REQUIRED],
        },
        documentation: { is: null },
        dispatch: { status: DispatchStatus.DISPATCHED },
      },
    });
  });
});

describe("mark dispatch for DCR", () => {
  it("creates a documentation record before invoice recording", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(pendingHandover as never);
    vi.mocked(client.documentationRecord.create).mockResolvedValue({
      id: "doc-1",
      status: DocumentationStatus.PENDING,
      createdAt: new Date("2026-08-18T00:00:00.000Z"),
      completedDate: null,
    } as never);

    const created = await markDispatchForDcr(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      changedById: "user-1",
    });

    expect(client.documentationRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        dispatchId: "dispatch-1",
        invoiceHandoverId: "handover-1",
        status: DocumentationStatus.PENDING,
        statusHistory: {
          create: expect.objectContaining({
            toStatus: DocumentationStatus.PENDING,
            changedById: "user-1",
            remarks: "Marked to send DCR before invoice recording",
          }),
        },
      }),
    }));
    expect(created.id).toBe("doc-1");
  });

  it("rejects a missing handover", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue(null);

    await expect(markDispatchForDcr(client, {
      companyId: "company-1",
      handoverId: "missing",
      changedById: "user-1",
    })).rejects.toThrow("NOT_FOUND");
    expect(client.documentationRecord.create).not.toHaveBeenCalled();
  });

  it("rejects when documentation already exists", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      ...pendingHandover,
      documentation: { id: "doc-1" },
    } as never);

    await expect(markDispatchForDcr(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      changedById: "user-1",
    })).rejects.toThrow("ALREADY_EXISTS");
    expect(client.documentationRecord.create).not.toHaveBeenCalled();
  });

  it("rejects cancelled dispatches", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      ...pendingHandover,
      dispatch: { status: DispatchStatus.CANCELLED },
    } as never);

    await expect(markDispatchForDcr(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      changedById: "user-1",
    })).rejects.toThrow("DISPATCH_NOT_DISPATCHED");
    expect(client.documentationRecord.create).not.toHaveBeenCalled();
  });

  it("rejects handovers that already have an invoice recorded", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      ...pendingHandover,
      status: InvoiceHandoverStatus.INVOICE_RECORDED,
    } as never);

    await expect(markDispatchForDcr(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      changedById: "user-1",
    })).rejects.toThrow("NOT_PENDING_INVOICE");
    expect(client.documentationRecord.create).not.toHaveBeenCalled();
  });
});
