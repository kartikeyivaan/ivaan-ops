import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { canViewInventoryTimeline } from "@/lib/inventory-permissions";
import {
  getInventoryTimelineDateRange,
  loadInventoryTimeline,
} from "@/lib/inventory-timeline";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";

const querySchema = z.object({
  companyId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  combined: z.enum(["true", "false"]).default("false"),
});

function error(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return error("AUTH_REQUIRED", "Please login to continue.", 401);
  }
  if (!canViewInventoryTimeline(session.user.roles)) {
    return error(
      "FORBIDDEN",
      "You do not have permission to view the stock timeline.",
      403,
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    companyId: searchParams.get("companyId") || undefined,
    warehouseId: searchParams.get("warehouseId") || undefined,
    productId: searchParams.get("productId") || undefined,
    combined: searchParams.get("combined") || "false",
  });
  if (!parsed.success) {
    return error(
      "VALIDATION_ERROR",
      "Invalid timeline filters.",
      400,
      parsed.error.flatten(),
    );
  }

  const superAdmin = isSuperAdmin(session.user.roles);
  const permittedCompanyIds = superAdmin
    ? (
        await prisma.company.findMany({
          where: { isActive: true },
          select: { id: true },
        })
      ).map((company) => company.id)
    : session.user.companies.map((company) => company.id);
  const selectedCompanyId =
    parsed.data.companyId ?? session.user.activeCompanyId ?? undefined;

  if (
    selectedCompanyId &&
    !permittedCompanyIds.includes(selectedCompanyId)
  ) {
    return error("FORBIDDEN", "You cannot view this company.", 403);
  }

  const combined = parsed.data.combined === "true";
  if (!combined && !selectedCompanyId) {
    return error("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }
  const companyIds = combined
    ? permittedCompanyIds
    : [selectedCompanyId as string];

  if (parsed.data.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: parsed.data.warehouseId,
        companyId: { in: companyIds },
        isActive: true,
      },
      select: { id: true },
    });
    if (!warehouse) {
      return error(
        "WAREHOUSE_NOT_FOUND",
        "Warehouse is outside the selected company scope.",
        400,
      );
    }
  }

  const range = getInventoryTimelineDateRange();
  const timeline = await loadInventoryTimeline({
    companyIds,
    warehouseId: parsed.data.warehouseId,
    productId: parsed.data.productId,
    combined,
    ...range,
  });
  return NextResponse.json(timeline);
}
