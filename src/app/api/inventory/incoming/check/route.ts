import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreateIncoming } from "@/lib/inventory-permissions";
import {
  findDuplicatePurchaseInvoice,
  findSimilarIncomingLots,
} from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";
import { incomingLotCheckSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateIncoming(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { searchParams } = new URL(request.url);
  const parsed = incomingLotCheckSchema.safeParse({
    purchaseInvoiceNo: searchParams.get("purchaseInvoiceNo") ?? undefined,
    companyId: searchParams.get("companyId") ?? undefined,
    warehouseId: searchParams.get("warehouseId") ?? undefined,
    vendorId: searchParams.get("vendorId") ?? undefined,
    productId: searchParams.get("productId") ?? undefined,
    purchaseDate: searchParams.get("purchaseDate") ?? undefined,
    quantity: searchParams.get("quantity") ?? undefined,
    unitPurchaseRate: searchParams.get("unitPurchaseRate") ?? undefined,
    excludeLotId: searchParams.get("excludeLotId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid check parameters.", 400, parsed.error.flatten());
  }

  if (
    parsed.data.companyId &&
    !getSessionCompanyIds(session).includes(parsed.data.companyId)
  ) {
    return errorResponse("FORBIDDEN", "You do not have access to the selected company.", 403);
  }

  const duplicateInvoice = parsed.data.purchaseInvoiceNo
    ? await findDuplicatePurchaseInvoice(
        prisma,
        parsed.data.purchaseInvoiceNo,
        parsed.data.excludeLotId,
      )
    : null;

  const {
    companyId,
    warehouseId,
    vendorId,
    productId,
    purchaseDate,
    quantity,
    unitPurchaseRate,
    excludeLotId,
  } = parsed.data;

  const similarLots =
    companyId &&
    warehouseId &&
    productId &&
    purchaseDate &&
    quantity !== undefined &&
    unitPurchaseRate !== undefined
      ? await findSimilarIncomingLots(prisma, {
          companyId,
          warehouseId,
          vendorId,
          productId,
          purchaseDate: new Date(purchaseDate),
          quantity,
          unitPurchaseRate,
          excludeLotId,
        })
      : [];

  return NextResponse.json({
    duplicateInvoice: duplicateInvoice
      ? {
          lotNumber: duplicateInvoice.lotNumber,
          purchaseInvoiceNo: duplicateInvoice.purchaseInvoiceNo,
        }
      : null,
    similarLots,
  });
}
