import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canViewProjectProposals } from "@/lib/project-proposal-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectProposalErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: {
              in: [
                ROLES.PROJECTS_SALES_EXECUTIVE,
                ROLES.PROJECTS_MANAGER,
                ROLES.SUPER_ADMIN,
              ],
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
