import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectEnquiryError, projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import { canManageProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { markProjectEnquiryLost } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { markProjectEnquiryLostSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

  const parsed = markProjectEnquiryLostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return projectEnquiryErrorResponse(
      "VALIDATION_ERROR",
      "Invalid lost reason.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  try {
    const enquiry = await markProjectEnquiryLost(prisma, {
      enquiryId: id,
      companyId,
      userId: session.user.id,
      userRoles: session.user.roles,
      lostReason: parsed.data.lostReason,
    });
    return NextResponse.json(enquiry);
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}
