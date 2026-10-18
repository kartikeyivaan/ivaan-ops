import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProposalPackages } from "@/lib/proposal-package-permissions";
import {
  deactivateProposalPackage,
  getProposalPackage,
  updateProposalPackage,
} from "@/lib/proposal-package-service";
import { prisma } from "@/lib/prisma";
import { upsertProposalPackageSchema } from "@/lib/validations";

function forbidden() {
  return NextResponse.json(
    { code: "FORBIDDEN", message: "Super Admin access required." },
    { status: 403 },
  );
}

function mapServiceError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const map: Record<string, { message: string; status: number }> = {
    PACKAGE_NOT_FOUND: { message: "Package not found.", status: 404 },
    PACKAGE_CODE_EXISTS: { message: "Package code already exists.", status: 409 },
    PACKAGE_CODE_IMMUTABLE: {
      message: "The NDCR_COMPLETE package code cannot be changed.",
      status: 400,
    },
    PACKAGE_MODULE_DEFAULT_INVALID: {
      message: "Only one default module is allowed per package.",
      status: 400,
    },
    PACKAGE_MODULE_DUPLICATE: {
      message: "Duplicate module products in package.",
      status: 400,
    },
    PACKAGE_MODULE_PRODUCT_NOT_FOUND: {
      message: "One or more module products were not found.",
      status: 400,
    },
    PACKAGE_MODULE_PRODUCT_INVALID: {
      message: "Module options must be active products from the Modules category.",
      status: 400,
    },
    MODULES_CATEGORY_NOT_FOUND: {
      message: "Modules product category is not configured.",
      status: 500,
    },
  };
  const entry = map[error.message];
  if (!entry) return null;
  return NextResponse.json(
    { code: error.message, message: entry.message },
    { status: entry.status },
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return forbidden();
  }

  const { id } = await context.params;
  try {
    const pkg = await getProposalPackage(prisma, id);
    return NextResponse.json({ package: pkg });
  } catch (error) {
    const mapped = mapServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return forbidden();
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = upsertProposalPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid package data.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const updated = await updateProposalPackage(prisma, id, parsed.data);
    return NextResponse.json({ package: updated });
  } catch (error) {
    const mapped = mapServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return forbidden();
  }

  const { id } = await context.params;
  try {
    const deactivated = await deactivateProposalPackage(prisma, id);
    return NextResponse.json({ package: deactivated });
  } catch (error) {
    const mapped = mapServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
