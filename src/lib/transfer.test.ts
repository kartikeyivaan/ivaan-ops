import { describe, expect, it } from "vitest";
import { getFinancialYear } from "@/lib/inventory";
import {
  canCancelTransfer,
  canCreateTransfer,
  canDispatchTransfer,
  canReceiveTransfer,
  canViewTransferSerials,
  canViewTransfers,
} from "@/lib/transfer-permissions";
import { aggregateInterCompanyTransferSummary } from "@/lib/transfer-service";
import { ROLES } from "@/lib/rbac";

describe("transfer permissions", () => {
  it("allows business roles to view transfers", () => {
    expect(canViewTransfers([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewTransfers([ROLES.ACCOUNTS])).toBe(true);
  });

  it("allows warehouse to manage transfers", () => {
    expect(canCreateTransfer([ROLES.WAREHOUSE])).toBe(true);
    expect(canDispatchTransfer([ROLES.WAREHOUSE])).toBe(true);
    expect(canReceiveTransfer([ROLES.WAREHOUSE])).toBe(true);
    expect(canCreateTransfer([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("restricts cancel to super admin", () => {
    expect(canCancelTransfer([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canCancelTransfer([ROLES.WAREHOUSE])).toBe(false);
  });

  it("hides serials from sales", () => {
    expect(canViewTransferSerials([ROLES.SALES_EXECUTIVE])).toBe(false);
    expect(canViewTransferSerials([ROLES.WAREHOUSE])).toBe(true);
  });
});

describe("transfer numbering", () => {
  it("uses financial year in transfer number format", () => {
    const fy = getFinancialYear(new Date("2025-06-01"));
    expect(fy).toBe("25-26");
    expect(`TRF-${fy}-00001`).toMatch(/^TRF-\d{2}-\d{2}-\d{5}$/);
  });

  it("pads sequence to 5 digits like existing transfers", () => {
    const fy = getFinancialYear(new Date("2026-08-08"));
    expect(`TRF-${fy}-${String(18).padStart(5, "0")}`).toBe("TRF-26-27-00018");
  });
});

describe("inter-company transfer summary", () => {
  const iseId = "ise-company-id";
  const pcmvId = "pcmv-company-id";

  it("aggregates pending qty by product and direction", () => {
    const rows = aggregateInterCompanyTransferSummary(
      [
        {
          productId: "p1",
          productName: "Inverter A",
          pendingQty: 3,
          fromCompanyId: iseId,
          toCompanyId: pcmvId,
        },
        {
          productId: "p1",
          productName: "Inverter A",
          pendingQty: 2,
          fromCompanyId: iseId,
          toCompanyId: pcmvId,
        },
        {
          productId: "p2",
          productName: "Battery B",
          pendingQty: 4,
          fromCompanyId: pcmvId,
          toCompanyId: iseId,
        },
      ],
      iseId,
      pcmvId,
    );

    expect(rows).toEqual([
      {
        productId: "p2",
        productName: "Battery B",
        iseToPcmv: 0,
        pcmvToIse: 4,
      },
      {
        productId: "p1",
        productName: "Inverter A",
        iseToPcmv: 5,
        pcmvToIse: 0,
      },
    ]);
  });

  it("ignores fully received lines", () => {
    expect(
      aggregateInterCompanyTransferSummary(
        [
          {
            productId: "p1",
            productName: "Inverter A",
            pendingQty: 0,
            fromCompanyId: iseId,
            toCompanyId: pcmvId,
          },
        ],
        iseId,
        pcmvId,
      ),
    ).toEqual([]);
  });
});
