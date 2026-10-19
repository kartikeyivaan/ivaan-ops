import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { validateSetDraftVersion } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  versionId: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid validation payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const result = await validateSetDraftVersion(prisma, companyId, id, parsed.data.versionId);
    return NextResponse.json(result);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to validate document set.", 500);
  }
}
