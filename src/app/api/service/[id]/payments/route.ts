import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canRecordServicePayment } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { recordServicePayment } from "@/lib/service-service";
import { recordServicePaymentSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRecordServicePayment(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = recordServicePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await recordServicePayment(prisma, {
      companyId: access.companyId,
      id,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode,
      paymentDate: parsed.data.paymentDate,
      reference: parsed.data.reference || null,
      performedByUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
