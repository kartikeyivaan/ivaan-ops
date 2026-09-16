import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAdjustStock, canInwardMaterial } from "@/lib/inventory-permissions";
import { normalizeSerialNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import {
  loadSerialOccupancies,
  occupyingSerialNumbers,
  productMismatchSerialNumbers,
  reentrySerialNumbers,
} from "@/lib/serial-lifecycle";
import { checkInventorySerialsSchema } from "@/lib/validations";

export const maxDuration = 60;

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (
    !session?.user ||
    (!canInwardMaterial(session.user.roles) && !canAdjustStock(session.user.roles))
  ) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = checkInventorySerialsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid serial check payload.",
      400,
      parsed.error.flatten(),
    );
  }

  const normalized = Array.from(
    new Set(parsed.data.serialNumbers.map(normalizeSerialNumber).filter(Boolean)),
  );

  const occupancies = await loadSerialOccupancies(prisma, normalized);
  const occupying = occupyingSerialNumbers(occupancies);
  const reentry = reentrySerialNumbers(occupancies);
  const productMismatches = productMismatchSerialNumbers(
    occupancies,
    parsed.data.productId,
  );

  return NextResponse.json({
    existingSerialNumbers: occupying,
    occupyingSerialNumbers: occupying,
    reentrySerialNumbers: reentry,
    productMismatchSerialNumbers: productMismatches,
    occupancies,
  });
}
