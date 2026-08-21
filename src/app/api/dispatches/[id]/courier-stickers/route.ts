import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { COURIER_STICKER_MAX_BOXES } from "@/lib/courier-sticker-constants";
import {
  generateCourierStickerPdf,
  type CourierStickerCustomer,
} from "@/lib/courier-sticker-pdf";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { getDispatchRecord } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const courierStickersBodySchema = z.object({
  boxes: z.number().int().min(1).max(COURIER_STICKER_MAX_BOXES),
  to: z
    .object({
      firmName: z.string().trim().min(1).max(200),
      contactName: z.string().trim().max(200).nullish(),
      address: z.string().trim().max(2000).nullish(),
      phone: z.string().trim().max(40).nullish(),
    })
    .optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function customerFromOverride(
  base: CourierStickerCustomer,
  to: z.infer<typeof courierStickersBodySchema>["to"],
): CourierStickerCustomer {
  if (!to) return base;
  return {
    customerName: to.firmName,
    contactPersonName: to.contactName?.trim() || null,
    // Edited address is printed as entered; clear locality fields to avoid duplicates.
    address: to.address?.trim() || null,
    city: null,
    state: null,
    pinCode: null,
    mobile: to.phone?.trim() || null,
  };
}

async function buildCourierPdfResponse(
  companyId: string,
  dispatchId: string,
  boxCount: number,
  toOverride?: z.infer<typeof courierStickersBodySchema>["to"],
) {
  const dispatch = await getDispatchRecord(prisma, companyId, dispatchId);
  if (!dispatch) {
    return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
  }
  if (dispatch.status === "DRAFT") {
    return errorResponse(
      "INVALID_STATUS",
      "Confirm dispatch before printing courier stickers.",
      400,
    );
  }

  const handover = await prisma.invoiceHandover.findUnique({
    where: { dispatchId: dispatch.id },
    select: { invoiceNumber: true },
  });

  const pdf = await generateCourierStickerPdf({
    dcNo: dispatch.dcNo,
    invoiceNumber: handover?.invoiceNumber ?? null,
    boxCount,
    customer: customerFromOverride(dispatch.customer, toOverride),
    company: dispatch.company,
  });

  const safeDc = dispatch.dcNo.replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeDc}-courier-stickers-${boxCount}boxes.pdf"`,
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const boxesRaw = new URL(request.url).searchParams.get("boxes");
  const boxCount = Number(boxesRaw);
  if (!Number.isInteger(boxCount) || boxCount < 1 || boxCount > COURIER_STICKER_MAX_BOXES) {
    return errorResponse(
      "INVALID_BOXES",
      `Enter a whole number of boxes between 1 and ${COURIER_STICKER_MAX_BOXES}.`,
      400,
    );
  }

  return buildCourierPdfResponse(companyId, id, boxCount);
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "Request body must be JSON.", 400);
  }

  const parsed = courierStickersBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid courier sticker request.",
      400,
    );
  }

  const { id } = await context.params;
  return buildCourierPdfResponse(companyId, id, parsed.data.boxes, parsed.data.to);
}
