import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isReferentialConstraintError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getVendorById, updateVendor } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { canManageVendors, canViewVendors } from "@/lib/vendor-permissions";
import { vendorUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewVendors(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { id } = await context.params;
  const vendor = await getVendorById(prisma, id);
  if (!vendor) {
    return errorResponse("NOT_FOUND", "Vendor not found.", 404);
  }

  return NextResponse.json(serializeVendor(vendor));
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageVendors(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { id } = await context.params;
  const existing = await getVendorById(prisma, id);
  if (!existing) {
    return errorResponse("NOT_FOUND", "Vendor not found.", 404);
  }

  const body = await request.json();
  const parsed = vendorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid vendor data.", 400, parsed.error.flatten());
  }

  const vendor = await updateVendor(prisma, id, parsed.data);

  await writeAuditLog({
    tableName: "vendors",
    recordId: vendor.id,
    action: "UPDATE",
    performedBy: session.user.id,
    oldValue: {
      vendorName: existing.vendorName,
      isActive: existing.isActive,
    },
    newValue: {
      vendorName: vendor.vendorName,
      isActive: vendor.isActive,
    },
  });

  return NextResponse.json(serializeVendor(vendor));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageVendors(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { id } = await context.params;
  const existing = await getVendorById(prisma, id);
  if (!existing) {
    return errorResponse("NOT_FOUND", "Vendor not found.", 404);
  }

  try {
    await prisma.vendor.delete({ where: { id } });

    await writeAuditLog({
      tableName: "vendors",
      recordId: id,
      action: "CANCEL",
      performedBy: session.user.id,
      oldValue: {
        vendorName: existing.vendorName,
        deleted: true,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (!isReferentialConstraintError(error)) {
      console.error("DELETE /api/vendors/[id] failed:", error);
      return errorResponse(
        "SERVER_ERROR",
        error instanceof Error ? error.message : "Failed to delete vendor.",
        500,
      );
    }

    const vendor = await updateVendor(prisma, id, {
      vendorName: existing.vendorName,
      gst: existing.gst ?? undefined,
      address: existing.address ?? undefined,
      contactPerson: existing.contactPerson ?? undefined,
      mobile: existing.mobile ?? undefined,
      email: existing.email ?? undefined,
      isActive: false,
    });

    await writeAuditLog({
      tableName: "vendors",
      recordId: vendor.id,
      action: "UPDATE",
      performedBy: session.user.id,
      oldValue: {
        vendorName: existing.vendorName,
        isActive: existing.isActive,
      },
      newValue: {
        vendorName: vendor.vendorName,
        isActive: vendor.isActive,
        deactivated: true,
        reason: "Vendor has existing purchase records and cannot be permanently deleted.",
      },
    });

    return NextResponse.json({
      deleted: false,
      deactivated: true,
      message:
        "Vendor has existing incoming purchase records and was marked inactive instead of permanently deleted.",
    });
  }
}
