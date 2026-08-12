import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { mapProjectEnquiryError, projectEnquiryErrorResponse } from "@/lib/project-enquiry-api";
import {
  canManageProjectEnquiries,
  canViewProjectEnquiries,
  restrictProjectEnquirySalesUserId,
} from "@/lib/project-enquiry-permissions";
import { createProjectEnquiry, listProjectEnquiries } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createProjectEnquirySchema, projectEnquirySearchSchema } from "@/lib/validations";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const parsed = projectEnquirySearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    salesUserId: searchParams.get("salesUserId") ?? undefined,
    customerMobile: searchParams.get("customerMobile") ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
  });
  if (!parsed.success) {
    return projectEnquiryErrorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const salesUserId = restrictProjectEnquirySalesUserId(
    session.user.roles,
    session.user.id,
    parsed.data.salesUserId,
  );

  const enquiries = await listProjectEnquiries(prisma, companyId, {
    ...parsed.data,
    salesUserId,
  });
  return NextResponse.json(enquiries);
}

export async function POST(request: Request) {
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

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return projectEnquiryErrorResponse("FORBIDDEN", "You do not have access to this company.", 403);
  }

  const parsed = createProjectEnquirySchema.safeParse(await request.json());
  if (!parsed.success) {
    return projectEnquiryErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project enquiry data.",
      400,
      parsed.error.flatten(),
    );
  }

  const salesUserId =
    restrictProjectEnquirySalesUserId(
      session.user.roles,
      session.user.id,
      parsed.data.salesUserId,
    ) ?? session.user.id;

  try {
    const enquiry = await createProjectEnquiry(prisma, {
      companyId,
      salesUserId,
      createdById: session.user.id,
      customerName: parsed.data.customerName,
      customerMobile: parsed.data.customerMobile,
      nextFollowupAt: new Date(parsed.data.nextFollowupAt),
    });
    return NextResponse.json(enquiry, { status: 201 });
  } catch (error) {
    const mapped = mapProjectEnquiryError(error);
    if (mapped) return mapped;
    throw error;
  }
}
