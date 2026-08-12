import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import { canViewProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewProjectEnquiries(session.user.roles)) {
    return projectEnquiryErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectEnquiryErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: {
              in: [ROLES.PROJECTS_SALES_EXECUTIVE, ROLES.PROJECTS_MANAGER, ROLES.SUPER_ADMIN],
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
