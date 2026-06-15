import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hasRole, isSuperAdmin, ROLES } from "@/lib/rbac";
import { warehouseSchema } from "@/lib/validations";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please login to continue." },
      { status: 401 },
    );
  }

  const allowedRoles = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER, ROLES.WAREHOUSE];
  if (!hasRole(session.user.roles, allowedRoles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const companyFilter = isSuperAdmin(session.user.roles)
    ? undefined
    : { companyId: { in: session.user.companies.map((c) => c.id) } };

  const warehouses = await prisma.warehouse.findMany({
    where: companyFilter,
    include: { company: true },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(warehouses);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
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

  const warehouse = await prisma.warehouse.create({
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
    action: "CREATE",
    performedBy: session.user.id,
    companyId: warehouse.companyId,
    newValue: warehouse,
  });

  return NextResponse.json(warehouse, { status: 201 });
}
