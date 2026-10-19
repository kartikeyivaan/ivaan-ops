import type { DocGenField } from "@prisma/client";
import type { TemplateContent } from "@/lib/doc-gen-template-content";
import { collectFieldReferences } from "@/lib/doc-gen-template-validation";
import {
  emptySetFieldConfig,
  parseSetFieldConfig,
  type SetFieldConfig,
  type SetFieldEntry,
} from "@/lib/doc-gen-set-field-config";

export type CompiledSetField = SetFieldEntry & {
  fieldKey: string;
  label: string;
  inputType: DocGenField["inputType"];
  configurationJson: DocGenField["configurationJson"];
  isRequiredDefault: boolean;
  defaultValue: string | null;
  helpText: string | null;
  placeholder: string | null;
};

/** Union field ids referenced across template contents, preserving prior sort/required overrides. */
export function compileSharedFieldConfig(
  templateContents: TemplateContent[],
  existingConfig: unknown,
  fieldsById: Map<string, DocGenField>,
): SetFieldConfig {
  const referencedIds = new Set<string>();
  for (const content of templateContents) {
    const refs = collectFieldReferences(content);
    for (const id of refs.fieldIds) {
      referencedIds.add(id);
    }
    for (const key of refs.fieldKeys) {
      const field = [...fieldsById.values()].find((f) => f.fieldKey === key);
      if (field) referencedIds.add(field.id);
    }
  }

  const prior = parseSetFieldConfig(existingConfig);
  const priorById = new Map(prior.fields.map((entry) => [entry.fieldId, entry]));
  const ordered: SetFieldEntry[] = [];

  const sortedPrior = [...prior.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const entry of sortedPrior) {
    if (!referencedIds.has(entry.fieldId)) continue;
    if (!fieldsById.has(entry.fieldId)) continue;
    ordered.push({ ...entry, sortOrder: ordered.length });
    referencedIds.delete(entry.fieldId);
  }

  for (const fieldId of referencedIds) {
    if (!fieldsById.has(fieldId)) continue;
    const priorEntry = priorById.get(fieldId);
    ordered.push({
      fieldId,
      sortOrder: ordered.length,
      ...(priorEntry?.isRequired !== undefined ? { isRequired: priorEntry.isRequired } : {}),
    });
  }

  return { fields: ordered };
}

export function enrichCompiledFields(
  config: SetFieldConfig,
  fieldsById: Map<string, DocGenField>,
): CompiledSetField[] {
  return [...config.fields]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((entry) => {
      const field = fieldsById.get(entry.fieldId);
      if (!field || field.status !== "ACTIVE") return [];
      return [
        {
          ...entry,
          fieldKey: field.fieldKey,
          label: field.label,
          inputType: field.inputType,
          configurationJson: field.configurationJson,
          isRequiredDefault: field.isRequiredDefault,
          defaultValue: field.defaultValue,
          helpText: field.helpText,
          placeholder: field.placeholder,
        },
      ];
    });
}

export function fieldIsRequired(entry: SetFieldEntry, field: DocGenField): boolean {
  if (entry.isRequired !== undefined) return entry.isRequired;
  return field.isRequiredDefault;
}

export function mergeFieldValuesWithDefaults(
  compiled: CompiledSetField[],
  values: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...values };
  for (const row of compiled) {
    if ((merged[row.fieldKey] ?? "") === "" && row.defaultValue) {
      merged[row.fieldKey] = row.defaultValue;
    }
  }
  return merged;
}

export function missingFieldConfig(config: unknown): boolean {
  const parsed = config ? parseSetFieldConfig(config) : emptySetFieldConfig();
  return parsed.fields.length === 0;
}
