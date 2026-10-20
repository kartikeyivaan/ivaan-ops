import type { DocGenField } from "@prisma/client";
import type { CompiledSetField } from "@/lib/doc-gen-shared-fields";
import { fieldIsRequired } from "@/lib/doc-gen-shared-fields";

export type FieldValueValidationIssue = {
  fieldKey: string;
  message: string;
};

function fieldOptions(field: DocGenField): string[] {
  const config = field.configurationJson;
  if (!config || typeof config !== "object") return [];
  const options = (config as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options.filter((item): item is string => typeof item === "string");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateFieldValues(
  compiled: CompiledSetField[],
  rawValues: Record<string, string>,
  fieldsById: Map<string, DocGenField>,
): FieldValueValidationIssue[] {
  const issues: FieldValueValidationIssue[] = [];

  for (const row of compiled) {
    const field = fieldsById.get(row.fieldId);
    if (!field) continue;
    const value = (rawValues[row.fieldKey] ?? "").trim();
    const required = fieldIsRequired(row, field);

    if (required && !value) {
      issues.push({ fieldKey: row.fieldKey, message: `${field.label} is required.` });
      continue;
    }
    if (!value) continue;

    switch (field.inputType) {
      case "NUMBER": {
        if (!/^-?\d+(\.\d+)?$/.test(value)) {
          issues.push({ fieldKey: row.fieldKey, message: `${field.label} must be a number.` });
        }
        break;
      }
      case "DATE": {
        if (!isIsoDate(value)) {
          issues.push({
            fieldKey: row.fieldKey,
            message: `${field.label} must be a valid date (stored as YYYY-MM-DD, printed as DD/MMM/YYYY).`,
          });
        }
        break;
      }
      case "DROPDOWN":
      case "RADIO": {
        const options = fieldOptions(field);
        if (options.length && !options.includes(value)) {
          issues.push({ fieldKey: row.fieldKey, message: `${field.label} must be one of the allowed options.` });
        }
        break;
      }
      case "MULTI_SELECT": {
        const options = fieldOptions(field);
        const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
        if (!parts.length && required) {
          issues.push({ fieldKey: row.fieldKey, message: `${field.label} is required.` });
        } else if (options.length) {
          for (const part of parts) {
            if (!options.includes(part)) {
              issues.push({
                fieldKey: row.fieldKey,
                message: `${field.label} contains invalid option "${part}".`,
              });
              break;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return issues;
}
