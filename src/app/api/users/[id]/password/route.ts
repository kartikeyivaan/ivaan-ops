import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { changePasswordSchema } from "@/lib/validations";

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
  const existing = await prisma.user.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "User not found." },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid password data.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: null,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await writeAuditLog({
    tableName: "users",
    recordId: id,
    action: "UPDATE",
    performedBy: session.user.id,
    oldValue: { email: existing.email },
    newValue: {
      email: existing.email,
      passwordChanged: true,
      adminReset: true,
      unlocked: existing.status === UserStatus.LOCKED,
    },
  });

  return NextResponse.json({ success: true });
}
