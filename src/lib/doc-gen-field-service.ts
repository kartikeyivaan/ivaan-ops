import {
  DocGenEntityStatus,
  DocGenFieldInputType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_TABLES,
  writeDocGenAudit,
} from "@/lib/doc-gen-audit";
import { fieldKeyValidationMessage, isValidDocGenFieldKey, normalizeDocGenFieldKey } from "@/lib/doc-gen-field-key";

export type DocGenFieldInput = {
  fieldKey: string;
  label: string;
  inputType: DocGenFieldInputType;
  configurationJson?: Prisma.InputJsonValue;
  isRequiredDefault?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  placeholder?: string | null;
  status?: DocGenEntityStatus;
};

function choiceOptionsFromConfig(configurationJson: unknown): string[] {
  if (!configurationJson || typeof configurationJson !== "object") return [];
  const options = (configurationJson as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateDocGenFieldInput(input: DocGenFieldInput): string | null {
  const fieldKey = normalizeDocGenFieldKey(input.fieldKey);
  if (!fieldKey) return "Field key is required.";
  if (!isValidDocGenFieldKey(fieldKey)) return fieldKeyValidationMessage();
  if (!input.label.trim()) return "Display label is required.";
  if (
    input.inputType === DocGenFieldInputType.DROPDOWN ||
    input.inputType === DocGenFieldInputType.RADIO ||
    input.inputType === DocGenFieldInputType.MULTI_SELECT
  ) {
    const options = choiceOptionsFromConfig(input.configurationJson);
    if (!options.length) {
      return "Add at least one option for Dropdown, Radio, or Multi Select fields.";
    }
  }
  return null;
}

export async function listDocGenFields(
  prisma: PrismaClient,
  companyId: string,
  filters?: { q?: string; status?: DocGenEntityStatus },
) {
  const q = filters?.q?.trim();
  return prisma.docGenField.findMany({
    where: {
      companyId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { fieldKey: { contains: q, mode: "insensitive" } },
              { label: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { fieldKey: "asc" }],
  });
}

export async function createDocGenField(
  prisma: PrismaClient,
  input: {
    companyId: string;
    userId: string;
    data: DocGenFieldInput;
  },
) {
  const validationError = validateDocGenFieldInput(input.data);
  if (validationError) throw new Error(`VALIDATION:${validationError}`);

  const fieldKey = normalizeDocGenFieldKey(input.data.fieldKey);
  try {
    const field = await prisma.docGenField.create({
      data: {
        companyId: input.companyId,
        fieldKey,
        label: input.data.label.trim(),
        inputType: input.data.inputType,
        configurationJson: input.data.configurationJson ?? {},
        isRequiredDefault: input.data.isRequiredDefault ?? false,
        defaultValue: input.data.defaultValue ?? null,
        helpText: input.data.helpText ?? null,
        placeholder: input.data.placeholder ?? null,
        status: input.data.status ?? DocGenEntityStatus.ACTIVE,
        createdById: input.userId,
      },
    });
    await writeDocGenAudit({
      eventType: DOC_GEN_AUDIT_EVENTS.FIELD_CREATED,
      tableName: DOC_GEN_AUDIT_TABLES.fields,
      recordId: field.id,
      action: "CREATE",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: field.fieldKey,
      newValue: {
        fieldKey: field.fieldKey,
        label: field.label,
        inputType: field.inputType,
        status: field.status,
      },
    });
    return field;
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      throw new Error("DUPLICATE_FIELD_KEY");
    }
    throw cause;
  }
}

export async function updateDocGenField(
  prisma: PrismaClient,
  input: {
    companyId: string;
    fieldId: string;
    userId: string;
    data: Partial<DocGenFieldInput> & { fieldKey?: never };
  },
) {
  const existing = await prisma.docGenField.findFirst({
    where: { id: input.fieldId, companyId: input.companyId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (input.data.label !== undefined && !input.data.label.trim()) {
    throw new Error("VALIDATION:Display label is required.");
  }

  const nextInputType = input.data.inputType ?? existing.inputType;
  const nextConfiguration =
    input.data.configurationJson !== undefined
      ? input.data.configurationJson
      : existing.configurationJson;
  const optionsError = validateDocGenFieldInput({
    fieldKey: existing.fieldKey,
    label: input.data.label?.trim() || existing.label,
    inputType: nextInputType,
    configurationJson:
      nextConfiguration === null || nextConfiguration === undefined
        ? {}
        : (nextConfiguration as Prisma.InputJsonValue),
  });
  if (optionsError) throw new Error(`VALIDATION:${optionsError}`);

  const field = await prisma.docGenField.update({
    where: { id: existing.id },
    data: {
      ...(input.data.label !== undefined ? { label: input.data.label.trim() } : {}),
      ...(input.data.inputType !== undefined ? { inputType: input.data.inputType } : {}),
      ...(input.data.configurationJson !== undefined
        ? { configurationJson: input.data.configurationJson }
        : {}),
      ...(input.data.isRequiredDefault !== undefined
        ? { isRequiredDefault: input.data.isRequiredDefault }
        : {}),
      ...(input.data.defaultValue !== undefined ? { defaultValue: input.data.defaultValue } : {}),
      ...(input.data.helpText !== undefined ? { helpText: input.data.helpText } : {}),
      ...(input.data.placeholder !== undefined ? { placeholder: input.data.placeholder } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      updatedById: input.userId,
    },
  });
  await writeDocGenAudit({
    eventType: DOC_GEN_AUDIT_EVENTS.FIELD_UPDATED,
    tableName: DOC_GEN_AUDIT_TABLES.fields,
    recordId: field.id,
    action: "UPDATE",
    performedBy: input.userId,
    companyId: input.companyId,
    reference: field.fieldKey,
    oldValue: {
      label: existing.label,
      inputType: existing.inputType,
      status: existing.status,
    },
    newValue: {
      fieldKey: field.fieldKey,
      label: field.label,
      inputType: field.inputType,
      status: field.status,
    },
  });
  return field;
}

export async function deleteDocGenField(
  prisma: PrismaClient,
  input: {
    companyId: string;
    fieldId: string;
    userId: string;
  },
) {
  const existing = await prisma.docGenField.findFirst({
    where: { id: input.fieldId, companyId: input.companyId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  await prisma.docGenField.delete({ where: { id: existing.id } });
  await writeDocGenAudit({
    eventType: DOC_GEN_AUDIT_EVENTS.FIELD_DELETED,
    tableName: DOC_GEN_AUDIT_TABLES.fields,
    recordId: existing.id,
    action: "CANCEL",
    performedBy: input.userId,
    companyId: input.companyId,
    reference: existing.fieldKey,
    oldValue: {
      fieldKey: existing.fieldKey,
      label: existing.label,
      inputType: existing.inputType,
      status: existing.status,
    },
  });
  return existing;
}
