import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectEnquiryError, projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import { canManageProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { markProjectEnquiryWon } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProjectEnquiries(session.user.roles)) {
    return projectEnquiryErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectEnquiryErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  try {
    const enquiry = await markProjectEnquiryWon(prisma, {
      enquiryId: id,
      companyId,
      userId: session.user.id,
      userRoles: session.user.roles,
    });
    return NextResponse.json(enquiry);
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}
