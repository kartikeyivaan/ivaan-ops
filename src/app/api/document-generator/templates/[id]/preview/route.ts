import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  loadBackgroundPdfBytes,
  parsePageConfiguration,
  parseTemplateContent,
} from "@/lib/doc-gen-template-service";
import { renderTemplatePreviewPdf } from "@/lib/doc-gen-pdf-render";
import { pdfInlineResponse } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  versionId: z.string().uuid(),
  fieldValues: z.record(z.string()).default({}),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid preview payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id: templateId } = await context.params;
    const template = await prisma.docGenTemplate.findFirst({ where: { id: templateId, companyId } });
    if (!template) return docGenJsonError("Not found.", 404);

    const version = await prisma.docGenTemplateVersion.findFirst({
      where: { id: parsed.data.versionId, templateId },
    });
    if (!version) return docGenJsonError("Version not found.", 404);

    const content = parseTemplateContent(version.templateContentJson);
    const pageConfiguration = parsePageConfiguration(version.pageConfigurationJson);
    const backgroundBytes = await loadBackgroundPdfBytes(prisma, version);

    const pdf = await renderTemplatePreviewPdf({
      content,
      pageConfiguration,
      fieldValues: parsed.data.fieldValues,
      backgroundBytes,
    });

    return pdfInlineResponse(pdf, `${template.name} preview`);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to render preview.", 500);
  }
}
