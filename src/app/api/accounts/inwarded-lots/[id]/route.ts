import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInwardedLots } from "@/lib/accounts-permissions";
import { lotHasInwardActivity } from "@/lib/inventory";
import {
  getIncomingLotRecordedSerials,
  getLotById,
  serializeLotForRole,
} from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewInwardedLots(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const lot = await getLotById(prisma, id, companyId);
  if (!lot || !lotHasInwardActivity(lot)) {
    return errorResponse("NOT_FOUND", "Inwarded lot not found.", 404);
  }

  const recordedSerials = await getIncomingLotRecordedSerials(prisma, lot);

  return NextResponse.json({
    ...serializeLotForRole(lot, false),
    recordedSerials: recordedSerials.map((serial) => ({
      serialNumber: serial.serialNumber,
      createdAt: serial.createdAt.toISOString(),
      status: serial.status,
      currentLotNumber: serial.currentLotNumber,
      stillOnLot: serial.stillOnLot,
    })),
  });
}
