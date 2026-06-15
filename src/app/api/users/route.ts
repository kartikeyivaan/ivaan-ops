import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { userSchema } from "@/lib/validations";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const users = await prisma.user.findMany({
    include: {
      roles: { include: { role: true } },
      companies: { include: { company: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      roles: user.roles.map((r) => r.role),
      companies: user.companies.map((c) => c.company),
      createdAt: user.createdAt,
    })),
  );
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
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid user data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.password) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Password is required for new users." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json(
      { code: "DUPLICATE_EMAIL", message: "A user with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      mobile: parsed.data.mobile,
      passwordHash,
      status: parsed.data.status as UserStatus,
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

  await writeAuditLog({
    tableName: "users",
    recordId: user.id,
    action: "CREATE",
    performedBy: session.user.id,
    newValue: {
      name: user.name,
      email: user.email,
      status: user.status,
      roles: user.roles.map((r) => r.role.name),
      companies: user.companies.map((c) => c.company.code),
    },
  });

  return NextResponse.json(user, { status: 201 });
}
