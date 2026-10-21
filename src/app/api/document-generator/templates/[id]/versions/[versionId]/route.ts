import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { deleteDocGenTemplateVersion } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id, versionId } = await context.params;
    const version = await deleteDocGenTemplateVersion(prisma, {
      companyId,
      templateId: id,
      versionId,
      userId: session.user.id,
    });
    return NextResponse.json(version);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to delete template version.", 500);
  }
}
