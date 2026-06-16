import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isReferentialConstraintError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { warehouseSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Warehouse not found." },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = warehouseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid warehouse data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        companyId: parsed.data.companyId,
        name: parsed.data.name,
        code: parsed.data.code,
        isActive: parsed.data.isActive,
      },
      include: { company: true },
    });

    await writeAuditLog({
      tableName: "warehouses",
      recordId: warehouse.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId: warehouse.companyId,
      oldValue: existing,
      newValue: warehouse,
    });

    return NextResponse.json(warehouse);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { code: "DUPLICATE_NAME", message: "A warehouse with this name already exists for the company." },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const existing = await prisma.warehouse.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!existing) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Warehouse not found." },
      { status: 404 },
    );
  }

  try {
    await prisma.warehouse.delete({ where: { id } });

    await writeAuditLog({
      tableName: "warehouses",
      recordId: id,
      action: "CANCEL",
      performedBy: session.user.id,
      companyId: existing.companyId,
      oldValue: existing,
      newValue: { deleted: true },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (!isReferentialConstraintError(error)) {
      console.error("DELETE /api/warehouses/[id] failed:", error);
      return NextResponse.json(
        {
          code: "SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to delete warehouse.",
        },
        { status: 500 },
      );
    }

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
      include: { company: true },
    });

    await writeAuditLog({
      tableName: "warehouses",
      recordId: warehouse.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId: warehouse.companyId,
      oldValue: existing,
      newValue: {
        ...warehouse,
        deactivated: true,
        reason: "Warehouse has existing records and cannot be permanently deleted.",
      },
    });

    return NextResponse.json({
      deleted: false,
      deactivated: true,
      message:
        "Warehouse has existing inventory or dispatch records and was deactivated instead of permanently deleted.",
    });
  }
}
