import { PdfDocumentType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import {
  buildDocGenFileName,
  customerNameFromSnapshot,
} from "@/lib/doc-gen-file-name";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { pdfInlineResponse } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id: generationId } = await context.params;
    const params = new URL(request.url).searchParams;
    const documentId = params.get("documentId");
    // Preview iframes need inline; only force download when explicitly requested.
    const download = params.get("download") === "1" || params.get("download") === "true";

    const generation = await prisma.docGenGeneration.findFirst({
      where: { id: generationId, companyId },
      include: {
        documentSet: { select: { name: true } },
        documents: {
          include: { template: { select: { name: true } } },
        },
      },
    });
    if (!generation) return docGenJsonError("Not found.", 404);

    const customerName = customerNameFromSnapshot(generation.customerSnapshotJson);

    if (documentId) {
      const doc = generation.documents.find((row) => row.id === documentId);
      if (!doc?.storedPdfId) return docGenJsonError("PDF not available.", 404);
      const stored = await prisma.storedPdf.findUnique({ where: { id: doc.storedPdfId } });
      if (!stored) return docGenJsonError("PDF not found.", 404);
      const templateName = doc.template?.name ?? doc.documentName;
      return pdfInlineResponse(
        Buffer.from(stored.pdfData),
        buildDocGenFileName(customerName, templateName),
        { download },
      );
    }

    if (!generation.combinedStoredPdfId) {
      return docGenJsonError("Combined PDF not available.", 404);
    }
    const stored = await prisma.storedPdf.findUnique({
      where: { id: generation.combinedStoredPdfId },
    });
    if (!stored || stored.documentType !== PdfDocumentType.DOC_GEN_COMBINED) {
      return docGenJsonError("Combined PDF not found.", 404);
    }
    return pdfInlineResponse(
      Buffer.from(stored.pdfData),
      buildDocGenFileName(customerName, generation.documentSet.name),
      { download },
    );
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to download PDF.", 500);
  }
}
