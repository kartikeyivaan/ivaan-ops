import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { companySchema } from "@/lib/validations";

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
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Company not found." },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid company data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      bankDetails: parsed.data.bankDetails,
      termsAndConditions: parsed.data.termsAndConditions,
      logoUrl: parsed.data.logoUrl || null,
      digitalSignatureUrl: parsed.data.digitalSignatureUrl || null,
      isActive: parsed.data.isActive,
    },
  });

  await writeAuditLog({
    tableName: "companies",
    recordId: company.id,
    action: "UPDATE",
    performedBy: session.user.id,
    companyId: company.id,
    oldValue: existing,
    newValue: company,
  });

  return NextResponse.json(company);
}
