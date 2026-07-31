import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canApproveDispatchToday,
  canMarkDispatchToday,
} from "@/lib/pi-permissions";
import { markDispatchToday } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { markDispatchTodaySchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canMarkDispatchToday(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = markDispatchTodaySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid dispatch today data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const pi = await markDispatchToday(prisma, {
      companyId,
      piId: id,
      markedById: session.user.id,
      canApproveEarly: canApproveDispatchToday(session.user.roles),
      confirmEarly: parsed.data.confirmEarly,
      draft: {
        vehicleNo: parsed.data.vehicleNo,
        driverName: parsed.data.driverName,
        receiverName: parsed.data.receiverName,
        receiverMobile: parsed.data.receiverMobile,
        notes: parsed.data.notes,
      },
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "NOT_READY_FOR_DISPATCH") {
        return errorResponse(
          "NOT_READY_FOR_DISPATCH",
          "PI must be booked and fully paid before dispatch today.",
          400,
        );
      }
      if (error.message === "DISPATCH_TODAY_ALREADY_REQUESTED") {
        return errorResponse(
          "DISPATCH_TODAY_ALREADY_REQUESTED",
          "Early dispatch today is already pending approval.",
          400,
        );
      }
      if (error.message.startsWith("EARLY_DISPATCH_CONFIRMATION_REQUIRED|")) {
        const [, daysUntil, committedDate] = error.message.split("|");
        return errorResponse(
          "EARLY_DISPATCH_CONFIRMATION_REQUIRED",
          `Committed delivery date is after ${daysUntil} day(s). Confirm to continue.`,
          409,
          { daysUntil: Number(daysUntil), committedDate },
        );
      }
    }
    throw error;
  }
}
