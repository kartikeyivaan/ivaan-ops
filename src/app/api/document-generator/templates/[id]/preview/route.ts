import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  loadBackgroundPdfBytes,
  loadWordDocxBytes,
  parsePageConfiguration,
  parseTemplateContent,
} from "@/lib/doc-gen-template-service";
import { formatDocGenFieldValuesForOutput } from "@/lib/doc-gen-date";
import { listDocGenFields } from "@/lib/doc-gen-field-service";
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
    const wordBytes =
      content.editor === "WORD" ? await loadWordDocxBytes(prisma, version) : null;
    const fields = await listDocGenFields(prisma, companyId, { status: "ACTIVE" });

    const pdf = await renderTemplatePreviewPdf({
      content,
      pageConfiguration,
      fieldValues: formatDocGenFieldValuesForOutput(parsed.data.fieldValues, fields),
      backgroundBytes,
      wordBytes,
    });

    return pdfInlineResponse(pdf, `${template.name} preview`);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to render preview.", 500);
  }
}
