import type { DocGenField, DocGenTemplateVersion } from "@prisma/client";
import type { TemplateContent } from "@/lib/doc-gen-template-content";
import { collectFieldReferences, validateTemplateContent } from "@/lib/doc-gen-template-validation";
import { parseSetFieldConfig } from "@/lib/doc-gen-set-field-config";
import { parseTemplateContent } from "@/lib/doc-gen-template-service";

export type DocGenSetValidationIssue = {
  code: string;
  message: string;
};

type SetItemInput = {
  templateVersionId: string;
  displayName: string;
  templateVersion?: DocGenTemplateVersion & {
    template?: { editorType: string; companyId: string };
  };
  content?: TemplateContent;
};

export function validateDocumentSetVersion(input: {
  items: SetItemInput[];
  fieldConfigJson: unknown;
  fields: DocGenField[];
  companyId: string;
}): { valid: boolean; issues: DocGenSetValidationIssue[] } {
  const issues: DocGenSetValidationIssue[] = [];
  const fieldConfig = parseSetFieldConfig(input.fieldConfigJson);
  const fieldsById = new Map(input.fields.filter((f) => f.status === "ACTIVE").map((f) => [f.id, f]));
  const configFieldIds = new Set(fieldConfig.fields.map((f) => f.fieldId));

  if (!input.items.length) {
    issues.push({ code: "NO_DOCUMENTS", message: "Add at least one published template to the set." });
  }

  const referencedFieldIds = new Set<string>();

  for (const item of input.items) {
    const version = item.templateVersion;
    if (!version) {
      issues.push({
        code: "MISSING_TEMPLATE_VERSION",
        message: `Template version ${item.templateVersionId} was not found.`,
      });
      continue;
    }
    if (version.status !== "PUBLISHED") {
      issues.push({
        code: "UNPUBLISHED_TEMPLATE",
        message: `"${item.displayName}" must use a published template version.`,
      });
    }
    if (version.template?.companyId && version.template.companyId !== input.companyId) {
      issues.push({
        code: "WRONG_COMPANY",
        message: `"${item.displayName}" belongs to another company.`,
      });
    }

    const content = item.content ?? parseTemplateContent(version.templateContentJson);
    const templateIssues = validateTemplateContent(content, input.fields, {
      requireBackground: version.template?.editorType === "PDF_BACKGROUND",
      hasBackground: Boolean(version.backgroundStoredPdfId),
    });
    for (const issue of templateIssues) {
      issues.push({ code: issue.code, message: `${item.displayName}: ${issue.message}` });
    }

    const refs = collectFieldReferences(content);
    for (const fieldId of refs.fieldIds) referencedFieldIds.add(fieldId);
    for (const fieldKey of refs.fieldKeys) {
      const field = input.fields.find((f) => f.fieldKey === fieldKey && f.status === "ACTIVE");
      if (field) referencedFieldIds.add(field.id);
    }
  }

  for (const fieldId of referencedFieldIds) {
    if (!configFieldIds.has(fieldId)) {
      const field = fieldsById.get(fieldId);
      issues.push({
        code: "FIELD_NOT_IN_SET_CONFIG",
        message: field
          ? `Shared field "${field.label}" is missing from the set field list — refresh fields.`
          : `Unknown field id ${fieldId} in set configuration.`,
      });
    }
  }

  for (const entry of fieldConfig.fields) {
    if (!fieldsById.has(entry.fieldId)) {
      issues.push({
        code: "INACTIVE_FIELD",
        message: `Shared field list references missing or inactive field ${entry.fieldId}.`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
