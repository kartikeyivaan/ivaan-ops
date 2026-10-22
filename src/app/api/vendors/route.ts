import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isDemoSession } from "@/lib/demo-mode";
import { createVendor, listVendors } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { canManageVendors, canViewVendors } from "@/lib/vendor-permissions";
import { vendorSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

function serializeVendor(vendor: {
  id: string;
  vendorName: string;
  gst: string | null;
  address: string | null;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: vendor.id,
    vendorName: vendor.vendorName,
    gst: vendor.gst,
    address: vendor.address,
    contactPerson: vendor.contactPerson,
    mobile: vendor.mobile,
    email: vendor.email,
    isActive: vendor.isActive,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewVendors(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const companyId = requireActiveCompany(session);
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const vendors = await listVendors(prisma, {
    companyId,
    includeInactive: includeInactive && canManageVendors(session.user.roles),
  });

  return NextResponse.json(vendors.map(serializeVendor));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageVendors(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  requireActiveCompany(session);

  const body = await request.json();
  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid vendor data.", 400, parsed.error.flatten());
  }

  let vendor;
  try {
    vendor = await createVendor(prisma, {
      ...parsed.data,
      forDemo: isDemoSession(session),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_VENDOR_NOT_ALLOWED") {
      return errorResponse(
        "DEMO_VENDOR_NOT_ALLOWED",
        "Demo vendor names/GST markers cannot be used in live companies.",
        400,
      );
    }
    throw error;
  }

  await writeAuditLog({
    tableName: "vendors",
    recordId: vendor.id,
    action: "CREATE",
    performedBy: session.user.id,
    newValue: {
      vendorName: vendor.vendorName,
      isActive: vendor.isActive,
    },
  });

  return NextResponse.json(serializeVendor(vendor), { status: 201 });
}
