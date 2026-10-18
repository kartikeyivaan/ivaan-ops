import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  getDraftVersion,
  parsePageConfiguration,
  parseTemplateContent,
  updateDraftVersion,
} from "@/lib/doc-gen-template-service";
import { pageConfigurationSchema, templateContentSchema } from "@/lib/doc-gen-template-content";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  versionId: z.string().uuid(),
  templateContentJson: templateContentSchema.optional(),
  pageConfigurationJson: pageConfigurationSchema.optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const template = await prisma.docGenTemplate.findFirst({ where: { id, companyId } });
    if (!template) return docGenJsonError("Not found.", 404);
    const draft = await getDraftVersion(prisma, id);
    if (!draft) return docGenJsonError("No draft version.", 404);
    return NextResponse.json(draft);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load draft.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid draft payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const updated = await updateDraftVersion(prisma, {
      companyId,
      templateId: id,
      versionId: parsed.data.versionId,
      userId: session.user.id,
      templateContentJson: parsed.data.templateContentJson
        ? parseTemplateContent(parsed.data.templateContentJson)
        : undefined,
      pageConfigurationJson: parsed.data.pageConfigurationJson
        ? parsePageConfiguration(parsed.data.pageConfigurationJson)
        : undefined,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to save draft.", 500);
  }
}
