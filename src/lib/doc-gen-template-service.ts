import {
  DocGenLayoutMode,
  DocGenTemplateEditorType,
  DocGenVersionStatus,
  PdfDocumentType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  defaultPageConfiguration,
  defaultTemplateContent,
  pageConfigurationSchema,
  templateContentSchema,
  type PageConfiguration,
  type TemplateContent,
} from "@/lib/doc-gen-template-content";
import { PDFDocument } from "pdf-lib";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_TABLES,
  writeDocGenAuditTx,
} from "@/lib/doc-gen-audit";
import { assertPdfUpload, DOC_GEN_BACKGROUND_MAX_PAGES } from "@/lib/doc-gen-background-upload";
import { validateTemplateContent } from "@/lib/doc-gen-template-validation";

export async function listDocGenTemplates(prisma: PrismaClient, companyId: string) {
  return prisma.docGenTemplate.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    include: {
      currentPublishedVersion: { select: { id: true, versionNumber: true, publishedAt: true } },
      versions: {
        where: { status: DocGenVersionStatus.DRAFT },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true },
      },
    },
  });
}

export async function getDocGenTemplate(prisma: PrismaClient, companyId: string, templateId: string) {
  return prisma.docGenTemplate.findFirst({
    where: { id: templateId, companyId },
    include: {
      currentPublishedVersion: true,
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });
}

export async function createDocGenTemplate(
  prisma: PrismaClient,
  input: {
    companyId: string;
    userId: string;
    name: string;
    description?: string | null;
    editorType: DocGenTemplateEditorType;
    layoutMode: DocGenLayoutMode;
  },
) {
  const content = defaultTemplateContent(input.editorType);
  const pageConfig = defaultPageConfiguration();

  return prisma.$transaction(async (tx) => {
    const template = await tx.docGenTemplate.create({
      data: {
        companyId: input.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        editorType: input.editorType,
        layoutMode: input.layoutMode,
        createdById: input.userId,
      },
    });

    await tx.docGenTemplateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        templateContentJson: content as Prisma.InputJsonValue,
        pageConfigurationJson: pageConfig as Prisma.InputJsonValue,
        status: DocGenVersionStatus.DRAFT,
        createdById: input.userId,
      },
    });

    return getDocGenTemplate(tx as PrismaClient, input.companyId, template.id);
  });
}

export async function getDraftVersion(prisma: PrismaClient, templateId: string) {
  return prisma.docGenTemplateVersion.findFirst({
    where: { templateId, status: DocGenVersionStatus.DRAFT },
    orderBy: { versionNumber: "desc" },
  });
}

export function parseTemplateContent(raw: unknown): TemplateContent {
  return templateContentSchema.parse(raw);
}

export function parsePageConfiguration(raw: unknown): PageConfiguration {
  return pageConfigurationSchema.parse(raw ?? {});
}

export async function updateDraftVersion(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    versionId: string;
    userId: string;
    templateContentJson?: TemplateContent;
    pageConfigurationJson?: PageConfiguration;
  },
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: input.templateId, companyId: input.companyId },
  });
  if (!template) throw new Error("NOT_FOUND");

  const version = await prisma.docGenTemplateVersion.findFirst({
    where: {
      id: input.versionId,
      templateId: input.templateId,
      status: DocGenVersionStatus.DRAFT,
    },
  });
  if (!version) throw new Error("DRAFT_NOT_FOUND");

  if (input.templateContentJson) {
    templateContentSchema.parse(input.templateContentJson);
  }
  if (input.pageConfigurationJson) {
    pageConfigurationSchema.parse(input.pageConfigurationJson);
  }

  return prisma.docGenTemplateVersion.update({
    where: { id: version.id },
    data: {
      ...(input.templateContentJson !== undefined
        ? { templateContentJson: input.templateContentJson as Prisma.InputJsonValue }
        : {}),
      ...(input.pageConfigurationJson !== undefined
        ? { pageConfigurationJson: input.pageConfigurationJson as Prisma.InputJsonValue }
        : {}),
    },
  });
}

export async function validateDraftVersion(
  prisma: PrismaClient,
  companyId: string,
  templateId: string,
  versionId: string,
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: templateId, companyId },
  });
  if (!template) throw new Error("NOT_FOUND");

  const version = await prisma.docGenTemplateVersion.findFirst({
    where: { id: versionId, templateId },
  });
  if (!version) throw new Error("NOT_FOUND");

  const content = parseTemplateContent(version.templateContentJson);
  const fields = await prisma.docGenField.findMany({ where: { companyId } });
  const hasBackground = Boolean(version.backgroundStoredPdfId);

  const issues = validateTemplateContent(content, fields, {
    requireBackground: template.editorType === "PDF_BACKGROUND",
    hasBackground,
  });

  return { valid: issues.length === 0, issues };
}

export async function publishTemplateVersion(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    versionId: string;
    userId: string;
  },
) {
  const validation = await validateDraftVersion(
    prisma,
    input.companyId,
    input.templateId,
    input.versionId,
  );
  if (!validation.valid) {
    const err = new Error("VALIDATION_ISSUES");
    (err as Error & { issues: unknown }).issues = validation.issues;
    throw err;
  }

  const draft = await prisma.docGenTemplateVersion.findFirst({
    where: {
      id: input.versionId,
      templateId: input.templateId,
      status: DocGenVersionStatus.DRAFT,
    },
    include: { template: { select: { name: true } } },
  });
  if (!draft) throw new Error("DRAFT_NOT_FOUND");

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const published = await tx.docGenTemplateVersion.update({
      where: { id: draft.id },
      data: {
        status: DocGenVersionStatus.PUBLISHED,
        publishedAt: now,
        publishedById: input.userId,
      },
    });

    await tx.docGenTemplate.update({
      where: { id: input.templateId },
      data: {
        currentPublishedVersionId: published.id,
        updatedById: input.userId,
      },
    });

    const nextVersionNumber = draft.versionNumber + 1;
    await tx.docGenTemplateVersion.create({
      data: {
        templateId: input.templateId,
        versionNumber: nextVersionNumber,
        templateContentJson: published.templateContentJson as Prisma.InputJsonValue,
        pageConfigurationJson: published.pageConfigurationJson as Prisma.InputJsonValue,
        backgroundStoredPdfId: published.backgroundStoredPdfId,
        status: DocGenVersionStatus.DRAFT,
        createdById: input.userId,
      },
    });

    await writeDocGenAuditTx(tx, {
      eventType: DOC_GEN_AUDIT_EVENTS.TEMPLATE_PUBLISHED,
      tableName: DOC_GEN_AUDIT_TABLES.templateVersions,
      recordId: published.id,
      action: "UPDATE",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: draft.template.name,
      newValue: {
        templateId: input.templateId,
        templateName: draft.template.name,
        versionNumber: published.versionNumber,
        status: published.status,
      },
    });

    return published;
  });
}

export async function attachBackgroundPdfToDraft(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    versionId: string;
    pdfBytes: Buffer;
  },
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: input.templateId, companyId: input.companyId },
  });
  if (!template) throw new Error("NOT_FOUND");
  if (template.editorType !== "PDF_BACKGROUND") throw new Error("VALIDATION:Background upload applies to PDF background templates only.");

  const version = await prisma.docGenTemplateVersion.findFirst({
    where: {
      id: input.versionId,
      templateId: input.templateId,
      status: DocGenVersionStatus.DRAFT,
    },
  });
  if (!version) throw new Error("DRAFT_NOT_FOUND");

  assertPdfUpload(input.pdfBytes);
  const parsed = await PDFDocument.load(input.pdfBytes, { ignoreEncryption: true });
  const pageCount = parsed.getPageCount();
  if (pageCount > DOC_GEN_BACKGROUND_MAX_PAGES) throw new Error("VALIDATION:PDF exceeds the maximum page count.");

  const pdfBytes = new Uint8Array(input.pdfBytes);
  const stored = await prisma.storedPdf.upsert({
    where: {
      documentType_documentId_variant: {
        documentType: PdfDocumentType.DOC_GEN_TEMPLATE_BACKGROUND,
        documentId: version.id,
        variant: "",
      },
    },
    create: {
      documentType: PdfDocumentType.DOC_GEN_TEMPLATE_BACKGROUND,
      documentId: version.id,
      variant: "",
      contentVersion: `pages:${pageCount}`,
      pdfData: pdfBytes,
    },
    update: {
      contentVersion: `pages:${pageCount}`,
      pdfData: pdfBytes,
      generatedAt: new Date(),
    },
  });

  const content = parseTemplateContent(version.templateContentJson);
  if (content.editor === "PDF_BACKGROUND") {
    const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
      const existing = content.pages.find((p) => p.pageIndex === pageIndex);
      const size = parsed.getPage(pageIndex).getSize();
      return (
        existing ?? {
          pageIndex,
          widthPt: size.width,
          heightPt: size.height,
          elements: [],
        }
      );
    });
    await prisma.docGenTemplateVersion.update({
      where: { id: version.id },
      data: {
        backgroundStoredPdfId: stored.id,
        templateContentJson: { editor: "PDF_BACKGROUND", pages } as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.docGenTemplateVersion.update({
      where: { id: version.id },
      data: { backgroundStoredPdfId: stored.id },
    });
  }

  return { storedPdfId: stored.id, pageCount };
}

export async function loadBackgroundPdfBytes(
  prisma: PrismaClient,
  version: { backgroundStoredPdfId: string | null },
): Promise<Buffer | null> {
  if (!version.backgroundStoredPdfId) return null;
  const row = await prisma.storedPdf.findUnique({
    where: { id: version.backgroundStoredPdfId },
    select: { pdfData: true },
  });
  return row ? Buffer.from(row.pdfData) : null;
}
