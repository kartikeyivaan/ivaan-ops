import { describe, expect, it, vi } from "vitest";
import {
  DispatchStatus,
  DocumentationStatus,
  InvoiceHandoverStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  markDcrRevokedAfterDcCancel,
  markInvoiceCancelledAfterDcRevoke,
} from "@/lib/dispatch-cancel-revoke-service";

function mockClient() {
  const client = {
    $transaction: vi.fn(async (operation: (tx: unknown) => unknown) => operation(client)),
    invoiceHandover: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }) => ({ id: "handover-1", ...data })),
    },
    documentationRecord: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }) => ({ id: "doc-1", ...data })),
    },
    documentationStatusHistory: {
      create: vi.fn(async ({ data }) => ({ id: "hist-1", ...data })),
    },
  };
  return client as unknown as PrismaClient;
}

describe("markInvoiceCancelledAfterDcRevoke", () => {
  it("marks a recorded invoice cancelled when DC is cancelled", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      id: "handover-1",
      status: InvoiceHandoverStatus.INVOICE_RECORDED,
      remarks: null,
      dispatch: { status: DispatchStatus.CANCELLED, dcNo: "DC-9" },
    } as never);

    await markInvoiceCancelledAfterDcRevoke(client, {
      companyId: "company-1",
      handoverId: "handover-1",
      actorUserId: "user-1",
      note: "Cancelled in Tally",
    });

    expect(client.invoiceHandover.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "handover-1" },
        data: expect.objectContaining({
          status: InvoiceHandoverStatus.INVOICE_CANCELLED,
        }),
      }),
    );
  });

  it("rejects when dispatch is not cancelled", async () => {
    const client = mockClient();
    vi.mocked(client.invoiceHandover.findFirst).mockResolvedValue({
      id: "handover-1",
      status: InvoiceHandoverStatus.INVOICE_RECORDED,
      dispatch: { status: DispatchStatus.DISPATCHED, dcNo: "DC-9" },
    } as never);

    await expect(
      markInvoiceCancelledAfterDcRevoke(client, {
        companyId: "company-1",
        handoverId: "handover-1",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow("DISPATCH_NOT_CANCELLED");
  });
});

describe("markDcrRevokedAfterDcCancel", () => {
  it("marks DCR revoked when DC was cancelled", async () => {
    const client = mockClient();
    vi.mocked(client.documentationRecord.findFirst).mockResolvedValue({
      id: "doc-1",
      status: DocumentationStatus.DCR_ISSUED,
      remarks: null,
      internalNotes: null,
      dispatch: { status: DispatchStatus.CANCELLED, dcNo: "DC-9" },
    } as never);

    await markDcrRevokedAfterDcCancel(client, {
      companyId: "company-1",
      documentationId: "doc-1",
      actorUserId: "user-1",
      note: "Recall sent",
    });

    expect(client.documentationRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DocumentationStatus.DCR_REVOKED }),
      }),
    );
    expect(client.documentationStatusHistory.create).toHaveBeenCalled();
  });
});
