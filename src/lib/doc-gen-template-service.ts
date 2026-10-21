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
import { assertDocxUpload, extractDocxPlaceholders } from "@/lib/doc-gen-word";

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
    requireWordFile: template.editorType === "WORD",
    hasWordFile: template.editorType === "WORD" ? hasBackground : false,
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
    select: { pdfData: true, documentType: true },
  });
  if (!row || row.documentType !== PdfDocumentType.DOC_GEN_TEMPLATE_BACKGROUND) return null;
  return Buffer.from(row.pdfData);
}

async function deleteBackgroundPdfsForVersions(
  tx: Prisma.TransactionClient,
  versionIds: string[],
  keepStoredPdfIds: string[] = [],
) {
  if (versionIds.length === 0) return;
  await tx.storedPdf.deleteMany({
    where: {
      documentType: {
        in: [PdfDocumentType.DOC_GEN_TEMPLATE_BACKGROUND, PdfDocumentType.DOC_GEN_TEMPLATE_WORD],
      },
      documentId: { in: versionIds },
      ...(keepStoredPdfIds.length > 0 ? { id: { notIn: keepStoredPdfIds } } : {}),
    },
  });
}

export async function attachWordDocxToDraft(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    versionId: string;
    fileName: string;
    docxBytes: Buffer;
  },
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: input.templateId, companyId: input.companyId },
  });
  if (!template) throw new Error("NOT_FOUND");
  if (template.editorType !== "WORD") {
    throw new Error("VALIDATION:Word upload applies to Word templates only.");
  }

  const version = await prisma.docGenTemplateVersion.findFirst({
    where: {
      id: input.versionId,
      templateId: input.templateId,
      status: DocGenVersionStatus.DRAFT,
    },
  });
  if (!version) throw new Error("DRAFT_NOT_FOUND");

  assertDocxUpload(input.docxBytes);
  const placeholders = await extractDocxPlaceholders(input.docxBytes);
  const safeName = input.fileName.trim().slice(0, 180) || "template.docx";

  const stored = await prisma.storedPdf.upsert({
    where: {
      documentType_documentId_variant: {
        documentType: PdfDocumentType.DOC_GEN_TEMPLATE_WORD,
        documentId: version.id,
        variant: "",
      },
    },
    create: {
      documentType: PdfDocumentType.DOC_GEN_TEMPLATE_WORD,
      documentId: version.id,
      variant: "",
      contentVersion: `docx:${placeholders.length}:${safeName}`,
      pdfData: new Uint8Array(input.docxBytes),
    },
    update: {
      contentVersion: `docx:${placeholders.length}:${safeName}`,
      pdfData: new Uint8Array(input.docxBytes),
      generatedAt: new Date(),
    },
  });

  await prisma.docGenTemplateVersion.update({
    where: { id: version.id },
    data: {
      backgroundStoredPdfId: stored.id,
      templateContentJson: {
        editor: "WORD",
        fileName: safeName,
        placeholders,
      } as Prisma.InputJsonValue,
    },
  });

  return { storedFileId: stored.id, fileName: safeName, placeholders };
}

export async function loadWordDocxBytes(
  prisma: PrismaClient,
  version: { backgroundStoredPdfId: string | null },
): Promise<Buffer | null> {
  if (!version.backgroundStoredPdfId) return null;
  const row = await prisma.storedPdf.findUnique({
    where: { id: version.backgroundStoredPdfId },
    select: { pdfData: true, documentType: true },
  });
  if (!row || row.documentType !== PdfDocumentType.DOC_GEN_TEMPLATE_WORD) return null;
  return Buffer.from(row.pdfData);
}

async function assertTemplateVersionsNotInUse(
  prisma: PrismaClient | Prisma.TransactionClient,
  versionIds: string[],
) {
  if (versionIds.length === 0) return;
  const [setItemCount, generatedCount] = await Promise.all([
    prisma.docGenDocumentSetVersionItem.count({
      where: { templateVersionId: { in: versionIds } },
    }),
    prisma.docGenGeneratedDocument.count({
      where: { templateVersionId: { in: versionIds } },
    }),
  ]);
  if (setItemCount > 0 || generatedCount > 0) {
    throw new Error("TEMPLATE_VERSION_IN_USE");
  }
}

export async function deleteDocGenTemplateVersion(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    versionId: string;
    userId: string;
  },
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: input.templateId, companyId: input.companyId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          status: true,
          templateContentJson: true,
          pageConfigurationJson: true,
          backgroundStoredPdfId: true,
        },
      },
    },
  });
  if (!template) throw new Error("NOT_FOUND");

  const version = template.versions.find((row) => row.id === input.versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (template.versions.length <= 1) throw new Error("LAST_TEMPLATE_VERSION");

  await assertTemplateVersionsNotInUse(prisma, [version.id]);

  const remaining = template.versions.filter((row) => row.id !== version.id);
  const wasDraft = version.status === DocGenVersionStatus.DRAFT;
  const needsReplacementDraft =
    wasDraft && !remaining.some((row) => row.status === DocGenVersionStatus.DRAFT);
  const sourceForDraft = remaining.find((row) => row.status === DocGenVersionStatus.PUBLISHED) ?? remaining[0];

  const keepStoredPdfIds = remaining
    .map((row) => row.backgroundStoredPdfId)
    .filter((id): id is string => Boolean(id));
  const nextPublished =
    template.currentPublishedVersionId === version.id
      ? remaining.find((row) => row.status === DocGenVersionStatus.PUBLISHED) ?? null
      : undefined;

  await prisma.$transaction(async (tx) => {
    if (nextPublished !== undefined) {
      await tx.docGenTemplate.update({
        where: { id: template.id },
        data: {
          currentPublishedVersionId: nextPublished?.id ?? null,
          updatedById: input.userId,
        },
      });
    }

    await deleteBackgroundPdfsForVersions(tx, [version.id], keepStoredPdfIds);
    await tx.docGenTemplateVersion.delete({ where: { id: version.id } });

    if (needsReplacementDraft && sourceForDraft) {
      const nextVersionNumber =
        Math.max(...remaining.map((row) => row.versionNumber), version.versionNumber) + 1;
      await tx.docGenTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: nextVersionNumber,
          templateContentJson: sourceForDraft.templateContentJson as Prisma.InputJsonValue,
          pageConfigurationJson: sourceForDraft.pageConfigurationJson as Prisma.InputJsonValue,
          backgroundStoredPdfId: sourceForDraft.backgroundStoredPdfId,
          status: DocGenVersionStatus.DRAFT,
          createdById: input.userId,
        },
      });
    }

    await tx.docGenTemplate.update({
      where: { id: template.id },
      data: { updatedById: input.userId },
    });

    await writeDocGenAuditTx(tx, {
      eventType: DOC_GEN_AUDIT_EVENTS.TEMPLATE_VERSION_DELETED,
      tableName: DOC_GEN_AUDIT_TABLES.templateVersions,
      recordId: version.id,
      action: "CANCEL",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: template.name,
      oldValue: {
        templateId: template.id,
        templateName: template.name,
        versionNumber: version.versionNumber,
        status: version.status,
      },
    });
  });

  return { id: version.id, versionNumber: version.versionNumber };
}

export async function deleteDocGenTemplate(
  prisma: PrismaClient,
  input: {
    companyId: string;
    templateId: string;
    userId: string;
  },
) {
  const template = await prisma.docGenTemplate.findFirst({
    where: { id: input.templateId, companyId: input.companyId },
    include: {
      versions: { select: { id: true, versionNumber: true, status: true } },
    },
  });
  if (!template) throw new Error("NOT_FOUND");

  const versionIds = template.versions.map((row) => row.id);
  try {
    await assertTemplateVersionsNotInUse(prisma, versionIds);
  } catch (error) {
    if (error instanceof Error && error.message === "TEMPLATE_VERSION_IN_USE") {
      throw new Error("TEMPLATE_IN_USE");
    }
    throw error;
  }

  const generatedOnTemplate = await prisma.docGenGeneratedDocument.count({
    where: { templateId: template.id },
  });
  if (generatedOnTemplate > 0) throw new Error("TEMPLATE_IN_USE");

  await prisma.$transaction(async (tx) => {
    await tx.docGenTemplate.update({
      where: { id: template.id },
      data: { currentPublishedVersionId: null, updatedById: input.userId },
    });
    await deleteBackgroundPdfsForVersions(tx, versionIds);
    await tx.docGenTemplateVersion.deleteMany({ where: { templateId: template.id } });
    await tx.docGenTemplate.delete({ where: { id: template.id } });

    await writeDocGenAuditTx(tx, {
      eventType: DOC_GEN_AUDIT_EVENTS.TEMPLATE_DELETED,
      tableName: DOC_GEN_AUDIT_TABLES.templates,
      recordId: template.id,
      action: "CANCEL",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: template.name,
      oldValue: {
        name: template.name,
        editorType: template.editorType,
        versionCount: template.versions.length,
        versions: template.versions,
      },
    });
  });

  return { id: template.id, name: template.name };
}
