import { NextResponse } from "next/server";
import { DamageReportStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import {
  canReportDamage,
  canViewDamagedItems,
} from "@/lib/inventory-permissions";
import {
  createDamageReport,
  listDamageReports,
} from "@/lib/damage-report-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createDamageReportSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

function mapCreateError(error: Error) {
  const map: Record<string, [string, string, number]> = {
    INVENTORY_OPS_BLOCKED: [
      "INVENTORY_OPS_BLOCKED",
      "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
      423,
    ],
    SERIAL_REQUIRED: ["VALIDATION_ERROR", "Serial number is required.", 400],
    SERIAL_NOT_FOUND: ["NOT_FOUND", "Serial number not found in this company.", 404],
    NOT_MODULE: ["VALIDATION_ERROR", "Only Modules (panels) can be reported as damaged here.", 400],
    ALREADY_PENDING: [
      "ALREADY_PENDING",
      "This panel already has a pending damage approval.",
      409,
    ],
    ALREADY_DAMAGED: ["VALIDATION_ERROR", "This panel is already marked damaged.", 400],
    SERIAL_BOOKED: ["VALIDATION_ERROR", "This panel is booked and cannot be marked damaged.", 400],
    SERIAL_DISPATCHED: [
      "VALIDATION_ERROR",
      "This panel is dispatched and cannot be marked damaged.",
      400,
    ],
    SERIAL_NOT_AVAILABLE: [
      "VALIDATION_ERROR",
      "This panel is not available to mark as damaged.",
      400,
    ],
    REASON_REQUIRED: ["VALIDATION_ERROR", "Reason is required.", 400],
  };
  return map[error.message] ?? null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDamagedItems(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  let status: DamageReportStatus | undefined;
  if (statusParam) {
    if (!Object.values(DamageReportStatus).includes(statusParam as DamageReportStatus)) {
      return errorResponse("VALIDATION_ERROR", "Invalid status filter.", 400);
    }
    status = statusParam as DamageReportStatus;
  }

  const rows = await listDamageReports(prisma, companyId, { status });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canReportDamage(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = createDamageReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid damage report data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    await assertInventoryOpsAllowed(prisma, companyId);
    const report = await createDamageReport(prisma, {
      companyId,
      serialNumber: parsed.data.serialNumber,
      category: parsed.data.category,
      reason: parsed.data.reason,
      requestedById: session.user.id,
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const mapped = mapCreateError(error);
      if (mapped) return errorResponse(mapped[0], mapped[1], mapped[2]);
    }
    throw error;
  }
}
