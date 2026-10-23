import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  attachBackgroundPdfToDraft,
  getDocGenTemplate,
  getDraftVersion,
  loadBackgroundPdfBytes,
} from "@/lib/doc-gen-template-service";
import { pdfInlineResponse } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id: templateId } = await context.params;
    const params = new URL(request.url).searchParams;
    const versionId = params.get("versionId");
    if (!versionId) return docGenJsonError("versionId is required.", 400);

    const template = await getDocGenTemplate(prisma, companyId, templateId);
    if (!template) return docGenJsonError("Not found.", 404);
    if (template.editorType !== "PDF_BACKGROUND") {
      return docGenJsonError("Background preview applies to PDF background templates only.", 400);
    }

    const draft = await getDraftVersion(prisma, templateId);
    if (!draft || draft.id !== versionId) return docGenJsonError("Draft not found.", 404);

    const bytes = await loadBackgroundPdfBytes(prisma, draft);
    if (!bytes) return docGenJsonError("No background PDF uploaded yet.", 404);

    const pageParam = params.get("pageIndex");
    if (pageParam == null || pageParam === "") {
      return pdfInlineResponse(bytes, `${template.name} background`);
    }

    const pageIndex = Number(pageParam);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return docGenJsonError("pageIndex must be a non-negative integer.", 400);
    }

    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (pageIndex >= source.getPageCount()) {
      return docGenJsonError("Page not found.", 404);
    }

    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [pageIndex]);
    single.addPage(copied);
    const pageBytes = Buffer.from(await single.save());
    return pdfInlineResponse(pageBytes, `${template.name} background page ${pageIndex + 1}`);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load background.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id: templateId } = await context.params;
    const form = await request.formData();
    const versionId = form.get("versionId");
    const file = form.get("file");
    if (typeof versionId !== "string") return docGenJsonError("versionId is required.", 400);
    if (!(file instanceof File)) return docGenJsonError("PDF file is required.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await attachBackgroundPdfToDraft(prisma, {
      companyId,
      templateId,
      versionId,
      pdfBytes: bytes,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to upload background.", 500);
  }
}
