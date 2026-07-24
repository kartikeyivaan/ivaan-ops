import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateService } from "@/lib/service-permissions";
import { resolveServiceAccess, serviceError } from "@/lib/service-api";
import {
  findDuplicateOpenServiceRequests,
  findPreviousServiceCustomer,
} from "@/lib/service-service";
import { duplicateCheckSchema } from "@/lib/service-validations";
import { normalizeMobileNumber } from "@/lib/service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const parsed = duplicateCheckSchema.safeParse({
    mobileNumber: searchParams.get("mobileNumber") ?? undefined,
    consumerNumber: searchParams.get("consumerNumber") ?? undefined,
  });
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid query.", 400, parsed.error.flatten());
  }

  const mobileNumber = parsed.data.mobileNumber
    ? normalizeMobileNumber(parsed.data.mobileNumber)
    : undefined;
  const consumerNumber = parsed.data.consumerNumber?.trim() || undefined;

  if (!mobileNumber && !consumerNumber) {
    return NextResponse.json({ duplicates: [], previousDetails: null });
  }

  const [duplicates, previousDetails] = await Promise.all([
    findDuplicateOpenServiceRequests(prisma, access.companyId, {
      mobileNumber,
      consumerNumber,
    }),
    findPreviousServiceCustomer(prisma, access.companyId, {
      mobileNumber,
      consumerNumber,
    }),
  ]);

  return NextResponse.json({ duplicates, previousDetails });
}
