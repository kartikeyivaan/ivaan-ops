import {
  DocGenVersionStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_TABLES,
  writeDocGenAuditTx,
} from "@/lib/doc-gen-audit";
import {
  compileSharedFieldConfig,
  enrichCompiledFields,
  missingFieldConfig,
} from "@/lib/doc-gen-shared-fields";
import { emptySetFieldConfig, parseSetFieldConfig, type SetFieldConfig } from "@/lib/doc-gen-set-field-config";
import { validateDocumentSetVersion } from "@/lib/doc-gen-set-validation";
import { parseTemplateContent } from "@/lib/doc-gen-template-service";

export type SetDraftItemInput = {
  templateVersionId: string;
  displayName: string;
  sortOrder: number;
};

export async function listDocGenDocumentSets(prisma: PrismaClient, companyId: string) {
  return prisma.docGenDocumentSet.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    include: {
      currentPublishedVersion: {
        select: { id: true, versionNumber: true, publishedAt: true },
      },
      versions: {
        where: { status: DocGenVersionStatus.DRAFT },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true },
      },
    },
  });
}

export async function listPublishedDocGenDocumentSets(prisma: PrismaClient, companyId: string) {
  return prisma.docGenDocumentSet.findMany({
    where: { companyId, status: "ACTIVE", currentPublishedVersionId: { not: null } },
    orderBy: { name: "asc" },
    include: {
      currentPublishedVersion: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              templateVersion: {
                include: { template: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });
}

export async function getDocGenDocumentSet(prisma: PrismaClient, companyId: string, setId: string) {
  return prisma.docGenDocumentSet.findFirst({
    where: { id: setId, companyId },
    include: {
      currentPublishedVersion: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              templateVersion: {
                include: { template: { select: { id: true, name: true, editorType: true } } },
              },
            },
          },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              templateVersion: {
                include: { template: { select: { id: true, name: true, editorType: true } } },
              },
            },
          },
        },
      },
    },
  });
}

export async function createDocGenDocumentSet(
  prisma: PrismaClient,
  input: { companyId: string; userId: string; name: string; description?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const set = await tx.docGenDocumentSet.create({
      data: {
        companyId: input.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        createdById: input.userId,
      },
    });

    await tx.docGenDocumentSetVersion.create({
      data: {
        documentSetId: set.id,
        versionNumber: 1,
        fieldConfigJson: emptySetFieldConfig() as Prisma.InputJsonValue,
        status: DocGenVersionStatus.DRAFT,
      },
    });

    return getDocGenDocumentSet(tx as PrismaClient, input.companyId, set.id);
  });
}

export async function getDraftSetVersion(prisma: PrismaClient, documentSetId: string) {
  return prisma.docGenDocumentSetVersion.findFirst({
    where: { documentSetId, status: DocGenVersionStatus.DRAFT },
    orderBy: { versionNumber: "desc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          templateVersion: {
            include: { template: { select: { id: true, name: true, editorType: true } } },
          },
        },
      },
    },
  });
}

export async function listPublishedTemplateVersions(prisma: PrismaClient, companyId: string) {
  return prisma.docGenTemplateVersion.findMany({
    where: {
      status: DocGenVersionStatus.PUBLISHED,
      template: { companyId, status: "ACTIVE" },
    },
    orderBy: [{ template: { name: "asc" } }, { versionNumber: "desc" }],
    include: {
      template: { select: { id: true, name: true, editorType: true } },
    },
  });
}

async function loadSetDraftContext(
  prisma: PrismaClient,
  companyId: string,
  documentSetId: string,
  versionId: string,
) {
  const set = await prisma.docGenDocumentSet.findFirst({ where: { id: documentSetId, companyId } });
  if (!set) throw new Error("NOT_FOUND");

  const version = await prisma.docGenDocumentSetVersion.findFirst({
    where: { id: versionId, documentSetId, status: DocGenVersionStatus.DRAFT },
  });
  if (!version) throw new Error("DRAFT_NOT_FOUND");

  return { set, version };
}

export async function updateSetDraftItems(
  prisma: PrismaClient,
  input: {
    companyId: string;
    documentSetId: string;
    versionId: string;
    userId: string;
    items: SetDraftItemInput[];
  },
) {
  const { set, version } = await loadSetDraftContext(
    prisma,
    input.companyId,
    input.documentSetId,
    input.versionId,
  );

  const templateVersions = await prisma.docGenTemplateVersion.findMany({
    where: {
      id: { in: input.items.map((item) => item.templateVersionId) },
      status: DocGenVersionStatus.PUBLISHED,
      template: { companyId: input.companyId },
    },
    include: { template: { select: { name: true, editorType: true, companyId: true } } },
  });
  const versionById = new Map(templateVersions.map((row) => [row.id, row]));

  for (const item of input.items) {
    if (!versionById.has(item.templateVersionId)) {
      throw new Error("VALIDATION:Each document must reference a published template version.");
    }
  }

  const fields = await prisma.docGenField.findMany({ where: { companyId: input.companyId } });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const contents = input.items.map((item) =>
    parseTemplateContent(versionById.get(item.templateVersionId)!.templateContentJson),
  );
  const fieldConfig = compileSharedFieldConfig(contents, version.fieldConfigJson, fieldsById);

  return prisma.$transaction(async (tx) => {
    await tx.docGenDocumentSetVersionItem.deleteMany({ where: { setVersionId: version.id } });
    if (input.items.length) {
      await tx.docGenDocumentSetVersionItem.createMany({
        data: input.items.map((item) => ({
          setVersionId: version.id,
          templateVersionId: item.templateVersionId,
          sortOrder: item.sortOrder,
          displayName: item.displayName.trim() || versionById.get(item.templateVersionId)!.template.name,
        })),
      });
    }

    await tx.docGenDocumentSetVersion.update({
      where: { id: version.id },
      data: { fieldConfigJson: fieldConfig as Prisma.InputJsonValue },
    });

    await tx.docGenDocumentSet.update({
      where: { id: set.id },
      data: { updatedById: input.userId },
    });

    return getDraftSetVersion(tx as PrismaClient, set.id);
  });
}

export async function updateSetFieldConfig(
  prisma: PrismaClient,
  input: {
    companyId: string;
    documentSetId: string;
    versionId: string;
    userId: string;
    fieldConfig: SetFieldConfig;
  },
) {
  const { set, version } = await loadSetDraftContext(
    prisma,
    input.companyId,
    input.documentSetId,
    input.versionId,
  );
  parseSetFieldConfig(input.fieldConfig);

  await prisma.$transaction([
    prisma.docGenDocumentSetVersion.update({
      where: { id: version.id },
      data: { fieldConfigJson: input.fieldConfig as Prisma.InputJsonValue },
    }),
    prisma.docGenDocumentSet.update({
      where: { id: set.id },
      data: { updatedById: input.userId },
    }),
  ]);

  return getDraftSetVersion(prisma, set.id);
}

export async function refreshSetSharedFields(
  prisma: PrismaClient,
  input: { companyId: string; documentSetId: string; versionId: string; userId: string },
) {
  const draft = await getDraftSetVersion(prisma, input.documentSetId);
  if (!draft || draft.id !== input.versionId) throw new Error("DRAFT_NOT_FOUND");

  const fields = await prisma.docGenField.findMany({ where: { companyId: input.companyId } });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const contents = draft.items.map((item) => parseTemplateContent(item.templateVersion.templateContentJson));
  const fieldConfig = compileSharedFieldConfig(contents, draft.fieldConfigJson, fieldsById);

  return updateSetFieldConfig(prisma, {
    companyId: input.companyId,
    documentSetId: input.documentSetId,
    versionId: input.versionId,
    userId: input.userId,
    fieldConfig,
  });
}

export async function validateSetDraftVersion(
  prisma: PrismaClient,
  companyId: string,
  documentSetId: string,
  versionId: string,
) {
  const set = await prisma.docGenDocumentSet.findFirst({ where: { id: documentSetId, companyId } });
  if (!set) throw new Error("NOT_FOUND");

  const version = await prisma.docGenDocumentSetVersion.findFirst({
    where: { id: versionId, documentSetId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          templateVersion: {
            include: { template: { select: { editorType: true, companyId: true } } },
          },
        },
      },
    },
  });
  if (!version) throw new Error("NOT_FOUND");

  const fields = await prisma.docGenField.findMany({ where: { companyId } });
  const result = validateDocumentSetVersion({
    items: version.items.map((item) => ({
      templateVersionId: item.templateVersionId,
      displayName: item.displayName,
      templateVersion: item.templateVersion,
    })),
    fieldConfigJson: version.fieldConfigJson,
    fields,
    companyId,
  });

  if (missingFieldConfig(version.fieldConfigJson) && version.items.length > 0) {
    result.issues.push({
      code: "EMPTY_FIELD_LIST",
      message: "Refresh shared fields before publishing.",
    });
    result.valid = false;
  }

  return result;
}

export async function publishDocumentSetVersion(
  prisma: PrismaClient,
  input: {
    companyId: string;
    documentSetId: string;
    versionId: string;
    userId: string;
  },
) {
  const validation = await validateSetDraftVersion(
    prisma,
    input.companyId,
    input.documentSetId,
    input.versionId,
  );
  if (!validation.valid) {
    const err = new Error("SET_VALIDATION_ISSUES");
    (err as Error & { issues: unknown }).issues = validation.issues;
    throw err;
  }

  const draft = await prisma.docGenDocumentSetVersion.findFirst({
    where: {
      id: input.versionId,
      documentSetId: input.documentSetId,
      status: DocGenVersionStatus.DRAFT,
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      documentSet: { select: { name: true } },
    },
  });
  if (!draft) throw new Error("DRAFT_NOT_FOUND");

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const published = await tx.docGenDocumentSetVersion.update({
      where: { id: draft.id },
      data: {
        status: DocGenVersionStatus.PUBLISHED,
        publishedAt: now,
        publishedById: input.userId,
      },
    });

    await tx.docGenDocumentSet.update({
      where: { id: input.documentSetId },
      data: {
        currentPublishedVersionId: published.id,
        updatedById: input.userId,
      },
    });

    const nextVersion = await tx.docGenDocumentSetVersion.create({
      data: {
        documentSetId: input.documentSetId,
        versionNumber: draft.versionNumber + 1,
        fieldConfigJson: draft.fieldConfigJson as Prisma.InputJsonValue,
        status: DocGenVersionStatus.DRAFT,
      },
    });

    if (draft.items.length) {
      await tx.docGenDocumentSetVersionItem.createMany({
        data: draft.items.map((item) => ({
          setVersionId: nextVersion.id,
          templateVersionId: item.templateVersionId,
          sortOrder: item.sortOrder,
          displayName: item.displayName,
        })),
      });
    }

    await writeDocGenAuditTx(tx, {
      eventType: DOC_GEN_AUDIT_EVENTS.SET_PUBLISHED,
      tableName: DOC_GEN_AUDIT_TABLES.setVersions,
      recordId: published.id,
      action: "UPDATE",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: draft.documentSet.name,
      newValue: {
        documentSetId: input.documentSetId,
        documentSetName: draft.documentSet.name,
        versionNumber: published.versionNumber,
        documentCount: draft.items.length,
        status: published.status,
      },
    });

    return published;
  });
}

export async function getPublishedSetFormSchema(
  prisma: PrismaClient,
  companyId: string,
  documentSetId: string,
) {
  const set = await prisma.docGenDocumentSet.findFirst({
    where: { id: documentSetId, companyId, status: "ACTIVE" },
    include: {
      currentPublishedVersion: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!set?.currentPublishedVersion) throw new Error("NOT_FOUND");

  const fields = await prisma.docGenField.findMany({ where: { companyId, status: "ACTIVE" } });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const config = parseSetFieldConfig(set.currentPublishedVersion.fieldConfigJson);

  const compiled = enrichCompiledFields(config, fieldsById);

  return {
    set: {
      id: set.id,
      name: set.name,
      description: set.description,
      versionId: set.currentPublishedVersion.id,
      versionNumber: set.currentPublishedVersion.versionNumber,
    },
    documents: set.currentPublishedVersion.items.map((item) => ({
      displayName: item.displayName,
      templateVersionId: item.templateVersionId,
      sortOrder: item.sortOrder,
    })),
    fields: compiled,
  };
}
