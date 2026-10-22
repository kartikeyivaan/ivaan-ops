import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { DEMO_COMPANY_CODE, validateDemoUserCompanyMembership } from "@/lib/demo-mode";
import { seedDemoUserSampleChain } from "@/lib/demo-sample-chain";
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
      officialContactNumber: user.officialContactNumber,
      personalContactNumber: user.personalContactNumber,
      digitalVisitingCardUrl: user.digitalVisitingCardUrl,
      status: user.status,
      isDemo: user.isDemo,
      roles: user.roles.map((r) => r.role),
      companies: user.companies.map((c) => c.company),
      createdAt: user.createdAt,
    })),
  );
}

export async function POST(request: Request) {
  try {
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

    const [companyRows, roleRows] = await Promise.all([
      prisma.company.findMany({
        where: { id: { in: parsed.data.companyIds } },
        select: { id: true, code: true, isDemo: true, isPractice: true },
      }),
      prisma.role.findMany({
        where: { id: { in: parsed.data.roleIds } },
        select: { id: true, name: true },
      }),
    ]);
    const membership = validateDemoUserCompanyMembership({
      isDemo: false,
      companyIds: parsed.data.companyIds,
      companies: companyRows,
      roleNames: roleRows.map((r) => r.name),
    });
    if (!membership.ok) {
      return NextResponse.json(
        { code: membership.code, message: membership.message },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        officialContactNumber: parsed.data.officialContactNumber || null,
        personalContactNumber: parsed.data.personalContactNumber || null,
        digitalVisitingCardUrl: parsed.data.digitalVisitingCardUrl || null,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
        isDemo: membership.isDemo,
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
        isDemo: user.isDemo,
        roles: user.roles.map((r) => r.role.name),
        companies: user.companies.map((c) => c.company.code),
      },
    });

    let sampleChain: { created: number; skipped: number } | null = null;
    if (membership.isDemo) {
      const demoCompany =
        companyRows.find((c) => c.isDemo || c.code === DEMO_COMPANY_CODE) ??
        (await prisma.company.findUnique({ where: { code: DEMO_COMPANY_CODE } }));
      const warehouse = demoCompany
        ? await prisma.warehouse.findFirst({
            where: { companyId: demoCompany.id },
            orderBy: { name: "asc" },
          })
        : null;
      if (demoCompany && warehouse) {
        try {
          sampleChain = await seedDemoUserSampleChain(prisma, {
            demoUserId: user.id,
            companyId: demoCompany.id,
            warehouseId: warehouse.id,
          });
        } catch (chainError) {
          console.error("[users] demo sample chain seed failed:", chainError);
        }
      }
    }

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        officialContactNumber: user.officialContactNumber,
        personalContactNumber: user.personalContactNumber,
        digitalVisitingCardUrl: user.digitalVisitingCardUrl,
        status: user.status,
        isDemo: user.isDemo,
        roles: user.roles.map((r) => r.role),
        companies: user.companies.map((c) => c.company),
        sampleChain,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/users failed:", error);
    return NextResponse.json(
      {
        code: "SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create user. Restart the dev server if schema was recently updated.",
      },
      { status: 500 },
    );
  }
}
