import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  PRACTICE_COMPANY_CODE,
  PRACTICE_COMPANY_NAME,
} from "@/lib/learning/lessons";
import { prisma } from "@/lib/prisma";

function mapCompanies(
  rows: Array<{ id: string; name: string; code: string; isPractice: boolean }>,
) {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    isPractice: c.isPractice,
  }));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  let practice = await prisma.company.findUnique({
    where: { code: PRACTICE_COMPANY_CODE },
  });

  if (!practice) {
    practice = await prisma.company.create({
      data: {
        code: PRACTICE_COMPANY_CODE,
        name: PRACTICE_COMPANY_NAME,
        isPractice: true,
        tagline: "Sandbox for Learning Mode",
        city: "Jalgaon",
        state: "Maharashtra",
      },
    });

    const existingWh = await prisma.warehouse.findFirst({
      where: { companyId: practice.id, name: "Practice HO" },
    });
    if (!existingWh) {
      await prisma.warehouse.create({
        data: {
          companyId: practice.id,
          name: "Practice HO",
          code: "LEARN-HO",
        },
      });
    }
  } else if (!practice.isPractice) {
    practice = await prisma.company.update({
      where: { id: practice.id },
      data: { isPractice: true },
    });
  }

  await prisma.userCompany.upsert({
    where: {
      userId_companyId: {
        userId: session.user.id,
        companyId: practice.id,
      },
    },
    create: {
      userId: session.user.id,
      companyId: practice.id,
    },
    update: {},
  });

  const userCompanies = await prisma.userCompany.findMany({
    where: { userId: session.user.id },
    include: { company: true },
  });

  const companies = mapCompanies(
    userCompanies
      .map((uc) => uc.company)
      .filter((c) => c.isActive)
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        isPractice: c.isPractice,
      })),
  );

  const returnCompanyId =
    session.user.learningReturnCompanyId ??
    (session.user.activeCompanyId &&
    session.user.activeCompanyId !== practice.id
      ? session.user.activeCompanyId
      : companies.find((c) => !c.isPractice)?.id ?? null);

  return NextResponse.json({
    practiceCompanyId: practice.id,
    returnCompanyId,
    companies,
    learningMode: true,
  });
}
