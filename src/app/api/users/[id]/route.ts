import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isReferentialConstraintError } from "@/lib/api-response";
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

  const duplicateEmail = await prisma.user.findFirst({
    where: {
      email: parsed.data.email.toLowerCase(),
      NOT: { id },
    },
  });
  if (duplicateEmail) {
    return NextResponse.json(
      { code: "DUPLICATE_EMAIL", message: "A user with this email already exists." },
      { status: 409 },
    );
  }

  if (
    existing.status === UserStatus.LOCKED &&
    parsed.data.status === "ACTIVE"
  ) {
    return NextResponse.json(
      {
        code: "ACCOUNT_LOCKED",
        message:
          "Locked accounts can only be unlocked by a Super Admin resetting the password.",
      },
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
        officialContactNumber: parsed.data.officialContactNumber || null,
        personalContactNumber: parsed.data.personalContactNumber || null,
        digitalVisitingCardUrl: parsed.data.digitalVisitingCardUrl || null,
        status:
          existing.status === UserStatus.LOCKED
            ? UserStatus.LOCKED
            : (parsed.data.status as UserStatus),
        ...(passwordHash
          ? {
              passwordHash,
              mustChangePassword: false,
              passwordChangedAt: new Date(),
            }
          : {}),
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
      ...(passwordHash ? { passwordChanged: true } : {}),
    },
  });

  return NextResponse.json(user);
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

  if (id === session.user.id) {
    return NextResponse.json(
      { code: "SELF_DELETE", message: "You cannot delete your own account." },
      { status: 400 },
    );
  }

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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userCompany.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    await writeAuditLog({
      tableName: "users",
      recordId: id,
      action: "CANCEL",
      performedBy: session.user.id,
      oldValue: {
        name: existing.name,
        email: existing.email,
        status: existing.status,
        roles: existing.roles.map((r) => r.role.name),
        companies: existing.companies.map((c) => c.company.code),
        deleted: true,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (!isReferentialConstraintError(error)) {
      console.error("DELETE /api/users/[id] failed:", error);
      return NextResponse.json(
        {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete user.",
        },
        { status: 500 },
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
      include: {
        roles: { include: { role: true } },
        companies: { include: { company: true } },
      },
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
      },
      newValue: {
        name: user.name,
        email: user.email,
        status: user.status,
        deactivated: true,
        reason: "User has existing records and cannot be permanently deleted.",
      },
    });

    return NextResponse.json({
      deleted: false,
      deactivated: true,
      message:
        "User has existing business records and was deactivated instead of permanently deleted.",
    });
  }
}
