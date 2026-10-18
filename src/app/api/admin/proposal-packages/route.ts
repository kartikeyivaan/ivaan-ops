import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProposalPackages } from "@/lib/proposal-package-permissions";
import {
  createProposalPackage,
  listProposalPackages,
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
    PACKAGE_CODE_EXISTS: { message: "Package code already exists.", status: 409 },
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

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return forbidden();
  }

  const packages = await listProposalPackages(prisma);
  return NextResponse.json({ packages });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return forbidden();
  }

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
    const created = await createProposalPackage(prisma, parsed.data);
    return NextResponse.json({ package: created }, { status: 201 });
  } catch (error) {
    const mapped = mapServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
