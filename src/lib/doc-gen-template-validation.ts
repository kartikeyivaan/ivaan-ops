import type { DocGenField } from "@prisma/client";
import type { TemplateContent } from "@/lib/doc-gen-template-content";

export type DocGenValidationIssue = {
  code: string;
  message: string;
  path?: string;
};

const FIELD_SPAN_PATTERN =
  /<span[^>]*data-doc-gen-field="([0-9a-f-]{36})"[^>]*data-doc-gen-key="([^"]+)"[^>]*>/gi;
const PLACEHOLDER_PATTERN = /\{([A-Z][A-Za-z0-9_]*)\}/g;

export function collectFieldReferences(content: TemplateContent): {
  fieldIds: Set<string>;
  fieldKeys: Set<string>;
} {
  const fieldIds = new Set<string>();
  const fieldKeys = new Set<string>();

  if (content.editor === "RICH_TEXT") {
    let match: RegExpExecArray | null;
    FIELD_SPAN_PATTERN.lastIndex = 0;
    while ((match = FIELD_SPAN_PATTERN.exec(content.html)) !== null) {
      fieldIds.add(match[1]!);
      fieldKeys.add(match[2]!);
    }
    PLACEHOLDER_PATTERN.lastIndex = 0;
    while ((match = PLACEHOLDER_PATTERN.exec(content.html)) !== null) {
      const key = match[1]!;
      if (![...fieldKeys].some((linked) => linked === key)) {
        fieldKeys.add(key);
      }
    }
  } else if (content.editor === "WORD") {
    for (const key of content.placeholders) {
      fieldKeys.add(key);
    }
  } else {
    for (const page of content.pages) {
      for (const element of page.elements) {
        if (element.kind === "field") {
          fieldIds.add(element.fieldId);
          fieldKeys.add(element.fieldKey);
        }
      }
    }
  }

  return { fieldIds, fieldKeys };
}

export function validateTemplateContent(
  content: TemplateContent,
  fields: DocGenField[],
  options?: {
    requireBackground?: boolean;
    hasBackground?: boolean;
    requireWordFile?: boolean;
    hasWordFile?: boolean;
  },
): DocGenValidationIssue[] {
  const issues: DocGenValidationIssue[] = [];
  const activeById = new Map(fields.filter((f) => f.status === "ACTIVE").map((f) => [f.id, f]));
  const activeByKey = new Map(fields.filter((f) => f.status === "ACTIVE").map((f) => [f.fieldKey, f]));

  const refs = collectFieldReferences(content);

  for (const fieldId of refs.fieldIds) {
    if (!activeById.has(fieldId)) {
      issues.push({
        code: "UNKNOWN_FIELD_ID",
        message: `Template references missing or inactive field id ${fieldId}.`,
      });
    }
  }

  for (const fieldKey of refs.fieldKeys) {
    if (!activeByKey.has(fieldKey)) {
      issues.push({
        code: "UNKNOWN_FIELD_KEY",
        message: `Unresolved placeholder {${fieldKey}} — no active field with this key.`,
      });
    }
  }

  if (content.editor === "RICH_TEXT") {
    const withoutFieldSpans = content.html.replace(
      /<span[^>]*data-doc-gen-field="[0-9a-f-]{36}"[^>]*>[\s\S]*?<\/span>/gi,
      "",
    );
    if (/\{[A-Z][A-Za-z0-9_]*\}/.test(withoutFieldSpans)) {
      issues.push({
        code: "UNLINKED_PLACEHOLDER",
        message: "Rich text contains placeholder text that is not linked to the field library.",
      });
    }
  }

  if (content.editor === "WORD") {
    if (options?.requireWordFile && !options.hasWordFile) {
      issues.push({
        code: "WORD_FILE_REQUIRED",
        message: "Upload a Word (.docx) template before publishing.",
      });
    }
    if (options?.hasWordFile && content.placeholders.length === 0) {
      issues.push({
        code: "WORD_NO_PLACEHOLDERS",
        message:
          "No {Field_Key} placeholders were found in the Word file. Add placeholders that match your field catalog.",
      });
    }
  }

  if (content.editor === "CANVAS" || content.editor === "PDF_BACKGROUND") {
    if (!content.pages.length) {
      issues.push({ code: "NO_PAGES", message: "Template must include at least one page." });
    }
    for (const page of content.pages) {
      for (const element of page.elements) {
        if (element.kind === "field") {
          const field = activeById.get(element.fieldId);
          if (field && field.fieldKey !== element.fieldKey) {
            issues.push({
              code: "FIELD_KEY_MISMATCH",
              message: `Field ${element.fieldKey} does not match library key ${field.fieldKey}.`,
              path: element.id,
            });
          }
        }
      }
    }
  }

  if (options?.requireBackground && !options.hasBackground) {
    issues.push({
      code: "BACKGROUND_REQUIRED",
      message: "Upload a PDF background before publishing this template.",
    });
  }

  return issues;
}
