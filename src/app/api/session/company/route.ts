import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setCompanySchema } from "@/lib/validations";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please login to continue." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const parsed = setCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid company selection." },
      { status: 400 },
    );
  }

  const allowed = session.user.companies.some(
    (c) => c.id === parsed.data.companyId,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        code: "COMPANY_ACCESS_DENIED",
        message: "You cannot access this company data.",
      },
      { status: 403 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: parsed.data.companyId },
  });
  if (!company?.isActive) {
    return NextResponse.json(
      { code: "COMPANY_INACTIVE", message: "Company is inactive." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    companyId: company.id,
    companyName: company.name,
    companyCode: company.code,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please login to continue." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    companies: session.user.companies,
    activeCompanyId: session.user.activeCompanyId,
  });
}
