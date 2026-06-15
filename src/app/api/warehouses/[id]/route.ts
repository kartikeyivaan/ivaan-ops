import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { warehouseSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

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
}
