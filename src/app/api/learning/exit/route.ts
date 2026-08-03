import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPracticeCompany } from "@/lib/learning/mode";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const userCompanies = await prisma.userCompany.findMany({
    where: { userId: session.user.id },
    include: { company: true },
  });

  const companies = userCompanies
    .map((uc) => uc.company)
    .filter((c) => c.isActive && !c.isPractice)
    .map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      isPractice: c.isPractice,
    }));

  const preferred =
    session.user.learningReturnCompanyId &&
    companies.some((c) => c.id === session.user.learningReturnCompanyId)
      ? session.user.learningReturnCompanyId
      : companies[0]?.id ?? null;

  // If somehow still on practice in DB-less JWT, client will restore preferred.
  const activeIsPractice = isPracticeCompany(
    session.user.companies.find((c) => c.id === session.user.activeCompanyId),
  );

  return NextResponse.json({
    companies,
    activeCompanyId: preferred,
    learningMode: false,
    learningReturnCompanyId: null,
    wasOnPractice: activeIsPractice,
  });
}
