import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canViewProjectProposals } from "@/lib/project-proposal-permissions";
import { decimalToNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const packages = await prisma.proposalPackageMaster.findMany({
    where: { isActive: true, isComingSoon: false },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      basePrice: true,
    },
  });

  return NextResponse.json(
    packages.map((pkg) => ({
      ...pkg,
      basePrice: decimalToNumber(pkg.basePrice),
    })),
  );
}
