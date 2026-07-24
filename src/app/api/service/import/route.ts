import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canImportService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { importServiceRequests, previewServiceImport } from "@/lib/service-service";
import { serviceImportSchema } from "@/lib/service-validations";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canImportService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const body = await request.json();
  const parsed = serviceImportSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError(
      "VALIDATION_ERROR",
      "Invalid import payload.",
      400,
      parsed.error.flatten(),
    );
  }

  const rows = parsed.data.rows.map((row) => ({ ...row }));

  if (parsed.data.mode === "preview") {
    const preview = await previewServiceImport(prisma, access.companyId, rows);
    return NextResponse.json(preview);
  }

  try {
    const result = await importServiceRequests(prisma, {
      companyId: access.companyId,
      performedByUserId: session.user.id,
      rows,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mapServiceError(error);
  }
}
