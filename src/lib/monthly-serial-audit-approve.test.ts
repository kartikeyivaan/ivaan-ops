import { describe, expect, it } from "vitest";

import {
  approveMonthlyAudit,
  updateMonthlyAuditQtyLine,
} from "@/lib/monthly-serial-audit-approve";

function fakePrisma(overrides: {
  audit?: { status: string } | null;
  line?: { id: string; recordQty: number } | null;
  pendingLines?: { auditQty: number | null; recordQty: number }[];
}) {
  return {
    inventoryMonthlyAudit: {
      findUnique: async () =>
        overrides.audit === undefined ? { status: "OPEN" } : overrides.audit,
    },
    inventoryMonthlyAuditQtyLine: {
      findFirst: async () => overrides.line ?? null,
      findMany: async () => overrides.pendingLines ?? [],
      update: async () => ({}),
    },
  } as never;
}

describe("updateMonthlyAuditQtyLine", () => {
  it("rejects negative or non-finite counts", async () => {
    const prisma = fakePrisma({ line: { id: "l1", recordQty: 5 } });
    await expect(
      updateMonthlyAuditQtyLine(prisma, { auditId: "a", lineId: "l1", auditQty: -1, userId: "u" }),
    ).rejects.toThrow("INVALID_QUANTITY");
    await expect(
      updateMonthlyAuditQtyLine(prisma, { auditId: "a", lineId: "l1", auditQty: Number.NaN, userId: "u" }),
    ).rejects.toThrow("INVALID_QUANTITY");
  });

  it("only accepts counts while the run is OPEN", async () => {
    const prisma = fakePrisma({ audit: { status: "CLOSED" }, line: { id: "l1", recordQty: 5 } });
    await expect(
      updateMonthlyAuditQtyLine(prisma, { auditId: "a", lineId: "l1", auditQty: 3, userId: "u" }),
    ).rejects.toThrow("AUDIT_NOT_OPEN");
  });
});

describe("approveMonthlyAudit", () => {
  it("refuses approval unless the run is CLOSED", async () => {
    const prisma = fakePrisma({ audit: { status: "OPEN" }, pendingLines: [] });
    await expect(
      approveMonthlyAudit(prisma, { auditId: "a", userId: "u" }),
    ).rejects.toThrow("INVALID_TRANSITION");
  });
});
