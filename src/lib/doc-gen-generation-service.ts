import {
  DocGenGenerationStatus,
  PdfDocumentType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_TABLES,
  writeDocGenAudit,
} from "@/lib/doc-gen-audit";
import type { DocGenCustomerSnapshot } from "@/lib/doc-gen-profile-service";
import {
  enrichCompiledFields,
  mergeFieldValuesWithDefaults,
} from "@/lib/doc-gen-shared-fields";
import { parseSetFieldConfig } from "@/lib/doc-gen-set-field-config";
import { formatDocGenFieldValuesForOutput } from "@/lib/doc-gen-date";
import { buildDocGenFileName } from "@/lib/doc-gen-file-name";
import { validateFieldValues } from "@/lib/doc-gen-field-values";
import { mergePdfBuffers } from "@/lib/doc-gen-pdf-merge";
import { renderTemplatePreviewPdf } from "@/lib/doc-gen-pdf-render";
import {
  loadBackgroundPdfBytes,
  loadWordDocxBytes,
  parsePageConfiguration,
  parseTemplateContent,
} from "@/lib/doc-gen-template-service";
import { pdfContentVersion } from "@/lib/pdf-cache";
import { PDFDocument } from "pdf-lib";

const generationDetailInclude = {
  documents: {
    orderBy: { createdAt: "asc" as const },
    include: {
      template: { select: { id: true, name: true } },
      templateVersion: { select: { id: true, versionNumber: true } },
    },
  },
  documentSet: { select: { id: true, name: true } },
  documentSetVersion: { select: { id: true, versionNumber: true } },
  generatedBy: { select: { id: true, name: true, email: true } },
  profile: { select: { id: true, displayName: true } },
} satisfies Prisma.DocGenGenerationInclude;

function countPdfPages(buffer: Buffer): Promise<number> {
  return PDFDocument.load(buffer, { ignoreEncryption: true }).then((doc) => doc.getPageCount());
}

export function resolveDocGenGenerationStatus(input: {
  anyDocumentFailed: boolean;
  successfulDocumentCount: number;
  combinedError: string | null;
}): DocGenGenerationStatus {
  if (input.anyDocumentFailed && input.successfulDocumentCount > 0) {
    return DocGenGenerationStatus.PARTIAL;
  }
  if (input.anyDocumentFailed || input.successfulDocumentCount === 0) {
    return DocGenGenerationStatus.FAILED;
  }
  if (input.combinedError) {
    return DocGenGenerationStatus.PARTIAL;
  }
  return DocGenGenerationStatus.COMPLETED;
}

export async function runDocGenGeneration(
  prisma: PrismaClient,
  input: {
    companyId: string;
    userId: string;
    documentSetId: string;
    fieldValues: Record<string, string>;
    customerSnapshot: DocGenCustomerSnapshot;
    profileId?: string | null;
  },
) {
  const set = await prisma.docGenDocumentSet.findFirst({
    where: { id: input.documentSetId, companyId: input.companyId, status: "ACTIVE" },
    include: {
      currentPublishedVersion: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              templateVersion: {
                include: { template: true },
              },
            },
          },
        },
      },
    },
  });

  if (!set?.currentPublishedVersion) throw new Error("NOT_FOUND");

  const customerName = input.customerSnapshot.displayName.trim() || "Customer";
  const fields = await prisma.docGenField.findMany({
    where: { companyId: input.companyId, status: "ACTIVE" },
  });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const compiled = enrichCompiledFields(
    parseSetFieldConfig(set.currentPublishedVersion.fieldConfigJson),
    fieldsById,
  );
  const mergedValues = mergeFieldValuesWithDefaults(compiled, input.fieldValues);
  const validationIssues = validateFieldValues(compiled, mergedValues, fieldsById);
  if (validationIssues.length) {
    const err = new Error("FIELD_VALIDATION");
    (err as Error & { issues: unknown }).issues = validationIssues;
    throw err;
  }

  const generation = await prisma.docGenGeneration.create({
    data: {
      companyId: input.companyId,
      documentSetId: set.id,
      documentSetVersionId: set.currentPublishedVersion.id,
      profileId: input.profileId ?? null,
      customerSnapshotJson: input.customerSnapshot as Prisma.InputJsonValue,
      status: DocGenGenerationStatus.PROCESSING,
      generatedById: input.userId,
      documents: {
        create: set.currentPublishedVersion.items.map((item) => {
          const templateName =
            item.templateVersion.template.name.trim() || item.displayName.trim() || "Document";
          return {
            templateId: item.templateVersion.templateId,
            templateVersionId: item.templateVersionId,
            documentName: buildDocGenFileName(customerName, templateName),
            status: DocGenGenerationStatus.PENDING,
          };
        }),
      },
    },
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });

  const docRecordByTemplateVersion = new Map(
    generation.documents.map((doc) => [doc.templateVersionId, doc]),
  );

  const successfulBuffers: Buffer[] = [];
  const documentErrors: string[] = [];
  let anyFailed = false;

  for (const item of set.currentPublishedVersion.items) {
    const docRecord = docRecordByTemplateVersion.get(item.templateVersionId);
    if (!docRecord) {
      anyFailed = true;
      documentErrors.push(`${item.displayName}: missing generation record.`);
      continue;
    }
    const version = item.templateVersion;
    if (!version) {
      anyFailed = true;
      documentErrors.push(`${item.displayName}: template version missing.`);
      await prisma.docGenGeneratedDocument.update({
        where: { id: docRecord.id },
        data: { status: DocGenGenerationStatus.FAILED },
      });
      continue;
    }

    try {
      const content = parseTemplateContent(version.templateContentJson);
      const pageConfiguration = parsePageConfiguration(version.pageConfigurationJson);
      const backgroundBytes = await loadBackgroundPdfBytes(prisma, version);
      const wordBytes =
        content.editor === "WORD" ? await loadWordDocxBytes(prisma, version) : null;
      const pdfBuffer = await renderTemplatePreviewPdf({
        content,
        pageConfiguration,
        fieldValues: formatDocGenFieldValuesForOutput(mergedValues, compiled),
        backgroundBytes,
        wordBytes,
      });
      const pageCount = await countPdfPages(pdfBuffer);
      const contentVersion = pdfContentVersion([
        docRecord.templateVersionId,
        set.currentPublishedVersion!.id,
        JSON.stringify(mergedValues),
      ]);

      const stored = await prisma.storedPdf.upsert({
        where: {
          documentType_documentId_variant: {
            documentType: PdfDocumentType.DOC_GEN_OUTPUT,
            documentId: docRecord.id,
            variant: "",
          },
        },
        create: {
          documentType: PdfDocumentType.DOC_GEN_OUTPUT,
          documentId: docRecord.id,
          variant: "",
          contentVersion,
          pdfData: new Uint8Array(pdfBuffer),
        },
        update: {
          contentVersion,
          pdfData: new Uint8Array(pdfBuffer),
          generatedAt: new Date(),
        },
      });

      const templateName =
        item.templateVersion.template.name.trim() || item.displayName.trim() || "Document";
      await prisma.docGenGeneratedDocument.update({
        where: { id: docRecord.id },
        data: {
          status: DocGenGenerationStatus.COMPLETED,
          storedPdfId: stored.id,
          pageCount,
          documentName: buildDocGenFileName(customerName, templateName),
        },
      });
      successfulBuffers.push(pdfBuffer);
    } catch (cause) {
      anyFailed = true;
      const detail = cause instanceof Error ? cause.message : "Unknown render error";
      documentErrors.push(`${item.displayName}: ${detail}`);
      await prisma.docGenGeneratedDocument.update({
        where: { id: docRecord.id },
        data: { status: DocGenGenerationStatus.FAILED },
      });
    }
  }

  let combinedStoredPdfId: string | null = null;
  let combinedError: string | null = null;

  if (successfulBuffers.length) {
    try {
      const combinedBuffer = await mergePdfBuffers(successfulBuffers);
      const contentVersion = pdfContentVersion([
        generation.id,
        set.currentPublishedVersion.id,
        successfulBuffers.length,
      ]);
      const stored = await prisma.storedPdf.upsert({
        where: {
          documentType_documentId_variant: {
            documentType: PdfDocumentType.DOC_GEN_COMBINED,
            documentId: generation.id,
            variant: "",
          },
        },
        create: {
          documentType: PdfDocumentType.DOC_GEN_COMBINED,
          documentId: generation.id,
          variant: "",
          contentVersion,
          pdfData: new Uint8Array(combinedBuffer),
        },
        update: {
          contentVersion,
          pdfData: new Uint8Array(combinedBuffer),
          generatedAt: new Date(),
        },
      });
      combinedStoredPdfId = stored.id;
    } catch {
      combinedError = "Combined PDF could not be created; download individual documents instead.";
    }
  }

  const status = resolveDocGenGenerationStatus({
    anyDocumentFailed: anyFailed,
    successfulDocumentCount: successfulBuffers.length,
    combinedError,
  });

  const errorParts = [...documentErrors];
  if (combinedError) errorParts.push(combinedError);
  const errorMessage = errorParts.length ? errorParts.join(" ") : null;

  const updated = await prisma.docGenGeneration.update({
    where: { id: generation.id },
    data: {
      status,
      combinedStoredPdfId,
      errorMessage,
    },
    include: generationDetailInclude,
  });

  await writeDocGenAudit({
    eventType: DOC_GEN_AUDIT_EVENTS.GENERATION_CREATED,
    tableName: DOC_GEN_AUDIT_TABLES.generations,
    recordId: updated.id,
    action: "CREATE",
    performedBy: input.userId,
    companyId: input.companyId,
    reference: updated.documentSet.name,
    newValue: {
      status: updated.status,
      documentSetId: updated.documentSetId,
      documentSetVersionId: updated.documentSetVersionId,
      documentSetVersionNumber: updated.documentSetVersion.versionNumber,
      documentCount: updated.documents.length,
      completedDocumentCount: updated.documents.filter(
        (doc) => doc.status === DocGenGenerationStatus.COMPLETED,
      ).length,
      combinedStoredPdfId: updated.combinedStoredPdfId,
      customerDisplayName: input.customerSnapshot.displayName,
      documents: updated.documents.map((doc) => ({
        id: doc.id,
        documentName: doc.documentName,
        status: doc.status,
        templateId: doc.templateId,
        templateVersionId: doc.templateVersionId,
        templateName: doc.template.name,
        templateVersionNumber: doc.templateVersion.versionNumber,
      })),
    },
  });

  return updated;
}

export type ListDocGenGenerationsFilters = {
  q?: string;
  status?: DocGenGenerationStatus;
  documentSetId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

function snapshotDisplayName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const name = (snapshot as { displayName?: unknown }).displayName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export async function listDocGenGenerations(
  prisma: PrismaClient,
  companyId: string,
  filters: ListDocGenGenerationsFilters = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const where: Prisma.DocGenGenerationWhereInput = { companyId };

  if (filters.status) where.status = filters.status;
  if (filters.documentSetId) where.documentSetId = filters.documentSetId;
  if (filters.fromDate || filters.toDate) {
    where.generatedAt = {};
    if (filters.fromDate) where.generatedAt.gte = new Date(`${filters.fromDate}T00:00:00.000Z`);
    if (filters.toDate) where.generatedAt.lte = new Date(`${filters.toDate}T23:59:59.999Z`);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { documentSet: { name: { contains: q, mode: "insensitive" } } },
      { generatedBy: { name: { contains: q, mode: "insensitive" } } },
      { generatedBy: { email: { contains: q, mode: "insensitive" } } },
      { profile: { displayName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.docGenGeneration.count({ where }),
    prisma.docGenGeneration.findMany({
      where,
      include: {
        documentSet: { select: { id: true, name: true } },
        documentSetVersion: { select: { id: true, versionNumber: true } },
        generatedBy: { select: { id: true, name: true, email: true } },
        profile: { select: { id: true, displayName: true } },
        documents: {
          select: { id: true, status: true, documentName: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { generatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      generatedAt: row.generatedAt.toISOString(),
      errorMessage: row.errorMessage,
      combinedStoredPdfId: row.combinedStoredPdfId,
      customerDisplayName:
        snapshotDisplayName(row.customerSnapshotJson) ?? row.profile?.displayName ?? null,
      documentSet: row.documentSet,
      documentSetVersion: row.documentSetVersion,
      generatedBy: row.generatedBy,
      documentCount: row.documents.length,
      completedDocumentCount: row.documents.filter(
        (doc) => doc.status === DocGenGenerationStatus.COMPLETED,
      ).length,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getDocGenGeneration(
  prisma: PrismaClient,
  companyId: string,
  generationId: string,
) {
  return prisma.docGenGeneration.findFirst({
    where: { id: generationId, companyId },
    include: generationDetailInclude,
  });
}
