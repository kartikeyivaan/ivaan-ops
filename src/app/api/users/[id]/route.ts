import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { userSchema } from "@/lib/validations";

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
  const existing = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { include: { role: true } },
      companies: { include: { company: true } },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "User not found." },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid user data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : undefined;

  const user = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userCompany.deleteMany({ where: { userId: id } });

    return tx.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        mobile: parsed.data.mobile,
        status: parsed.data.status as UserStatus,
        ...(passwordHash ? { passwordHash } : {}),
        roles: {
          create: parsed.data.roleIds.map((roleId) => ({ roleId })),
        },
        companies: {
          create: parsed.data.companyIds.map((companyId) => ({ companyId })),
        },
      },
      include: {
        roles: { include: { role: true } },
        companies: { include: { company: true } },
      },
    });
  });

  await writeAuditLog({
    tableName: "users",
    recordId: user.id,
    action: "UPDATE",
    performedBy: session.user.id,
    oldValue: {
      name: existing.name,
      email: existing.email,
      status: existing.status,
      roles: existing.roles.map((r) => r.role.name),
      companies: existing.companies.map((c) => c.company.code),
    },
    newValue: {
      name: user.name,
      email: user.email,
      status: user.status,
      roles: user.roles.map((r) => r.role.name),
      companies: user.companies.map((c) => c.company.code),
    },
  });

  return NextResponse.json(user);
}
