import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { publishTemplateVersion } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ versionId: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const published = await publishTemplateVersion(prisma, {
      companyId,
      templateId: id,
      versionId: parsed.data.versionId,
      userId: session.user.id,
    });
    return NextResponse.json(published);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to publish template.", 500);
  }
}
