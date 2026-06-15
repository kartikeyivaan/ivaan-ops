import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess, canViewCustomers } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return NextResponse.json(
      { code: "COMPANY_REQUIRED", message: "Select a company to continue." },
      { status: 400 },
    );
  }

  if (
    !assertCompanyAccess(
      session.user.roles,
      session.user.companies.map((c) => c.id),
      companyId,
    )
  ) {
    return NextResponse.json(
      { code: "COMPANY_ACCESS_DENIED", message: "You cannot access this company data." },
      { status: 403 },
    );
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: {
              in: [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN],
            },
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
