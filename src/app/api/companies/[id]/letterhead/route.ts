import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isOperationalLetterCompany } from "@/lib/letter-content";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { companyLetterheadSchema } from "@/lib/validations";

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
    return NextResponse.json({ code: "NOT_FOUND", message: "Company not found." }, { status: 404 });
  }
  if (!isOperationalLetterCompany(existing)) {
    return NextResponse.json(
      { code: "INVALID_COMPANY", message: "Letterhead settings are only available for ISE and PCMV." },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = companyLetterheadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid letterhead settings.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: {
    defaultSignatoryName: string;
    defaultSignatoryDesignation: string;
    printContentTopOffsetMm: number;
    signatureImageData?: string | null;
    stampImageData?: string | null;
  } = {
    defaultSignatoryName: parsed.data.defaultSignatoryName,
    defaultSignatoryDesignation: parsed.data.defaultSignatoryDesignation,
    printContentTopOffsetMm: parsed.data.printContentTopOffsetMm,
  };

  if (parsed.data.clearSignature) data.signatureImageData = null;
  else if (parsed.data.signatureImageData) data.signatureImageData = parsed.data.signatureImageData;

  if (parsed.data.clearStamp) data.stampImageData = null;
  else if (parsed.data.stampImageData) data.stampImageData = parsed.data.stampImageData;

  const company = await prisma.company.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      code: true,
      defaultSignatoryName: true,
      defaultSignatoryDesignation: true,
      printContentTopOffsetMm: true,
      signatureImageData: true,
      stampImageData: true,
    },
  });

  await writeAuditLog({
    tableName: "companies",
    recordId: company.id,
    action: "UPDATE",
    performedBy: session.user.id,
    companyId: company.id,
    reason: "letterhead_settings",
    oldValue: {
      defaultSignatoryName: existing.defaultSignatoryName,
      defaultSignatoryDesignation: existing.defaultSignatoryDesignation,
      printContentTopOffsetMm: existing.printContentTopOffsetMm,
      hasSignature: Boolean(existing.signatureImageData),
      hasStamp: Boolean(existing.stampImageData),
    },
    newValue: {
      defaultSignatoryName: company.defaultSignatoryName,
      defaultSignatoryDesignation: company.defaultSignatoryDesignation,
      printContentTopOffsetMm: company.printContentTopOffsetMm,
      hasSignature: Boolean(company.signatureImageData),
      hasStamp: Boolean(company.stampImageData),
    },
  });

  return NextResponse.json({
    ...company,
    hasSignature: Boolean(company.signatureImageData),
    hasStamp: Boolean(company.stampImageData),
    signatureImageData: undefined,
    stampImageData: undefined,
  });
}
