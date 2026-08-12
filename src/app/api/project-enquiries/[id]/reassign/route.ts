import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectEnquiryError, projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import { canReassignProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { reassignProjectEnquiry } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { reassignProjectEnquirySchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canReassignProjectEnquiries(session.user.roles)) {
    return projectEnquiryErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectEnquiryErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const parsed = reassignProjectEnquirySchema.safeParse(await request.json());
  if (!parsed.success) {
    return projectEnquiryErrorResponse(
      "VALIDATION_ERROR",
      "Invalid reassignment data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  try {
    const enquiry = await reassignProjectEnquiry(prisma, {
      enquiryId: id,
      companyId,
      userId: session.user.id,
      salesUserId: parsed.data.salesUserId,
    });
    return NextResponse.json(enquiry);
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}
