import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectEnquiryError, projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import { canManageProjectEnquiries, canViewProjectEnquiries } from "@/lib/project-enquiry-permissions";
import {
  assertProjectEnquiryAccess,
  getProjectEnquiryById,
  updateProjectEnquiry,
} from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { updateProjectEnquirySchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  try {
    const enquiry = await getProjectEnquiryById(prisma, companyId, id);
    if (!enquiry) {
      return projectEnquiryErrorResponse("NOT_FOUND", "Project enquiry not found.", 404);
    }
    assertProjectEnquiryAccess(session.user.roles, session.user.id, enquiry);
    return NextResponse.json(enquiry);
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = updateProjectEnquirySchema.safeParse(await request.json());
  if (!parsed.success) {
    return projectEnquiryErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project enquiry data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  try {
    const enquiry = await updateProjectEnquiry(prisma, {
      enquiryId: id,
      companyId,
      userId: session.user.id,
      userRoles: session.user.roles,
      customerName: parsed.data.customerName,
      customerMobile: parsed.data.customerMobile,
      nextFollowupAt: new Date(parsed.data.nextFollowupAt),
    });
    return NextResponse.json(enquiry);
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}
