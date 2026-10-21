import { describe, expect, it } from "vitest";
import type { DocGenField } from "@prisma/client";
import { collectFieldReferences, validateTemplateContent } from "@/lib/doc-gen-template-validation";

const baseField = (overrides: Partial<DocGenField>): DocGenField =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    companyId: "22222222-2222-2222-2222-222222222222",
    fieldKey: "Customer_Name",
    label: "Customer name",
    inputType: "TEXT",
    configurationJson: {},
    isRequiredDefault: false,
    defaultValue: null,
    helpText: null,
    placeholder: null,
    status: "ACTIVE",
    createdById: "33333333-3333-3333-3333-333333333333",
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DocGenField;

describe("doc gen template validation", () => {
  it("collects linked rich-text field ids", () => {
    const refs = collectFieldReferences({
      editor: "RICH_TEXT",
      html: `<p><span data-doc-gen-field="11111111-1111-1111-1111-111111111111" data-doc-gen-key="Customer_Name">{Customer_Name}</span></p>`,
    });
    expect(refs.fieldKeys.has("Customer_Name")).toBe(true);
    expect(refs.fieldIds.has("11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("flags unknown canvas field keys", () => {
    const issues = validateTemplateContent(
      {
        editor: "CANVAS",
        pages: [
          {
            pageIndex: 0,
            widthPt: 595,
            heightPt: 842,
            elements: [
              {
                kind: "field",
                id: "el1",
                fieldId: "11111111-1111-1111-1111-111111111111",
                fieldKey: "Missing_Key",
                x: 10,
                y: 10,
                width: 100,
                height: 20,
                fontSize: 11,
                align: "left",
              },
            ],
          },
        ],
      },
      [baseField({ fieldKey: "Customer_Name" })],
    );
    expect(issues.some((issue) => issue.code === "UNKNOWN_FIELD_KEY")).toBe(true);
  });

  it("requires pdf background before publish check", () => {
    const issues = validateTemplateContent(
      {
        editor: "PDF_BACKGROUND",
        pages: [{ pageIndex: 0, widthPt: 595, heightPt: 842, elements: [] }],
      },
      [],
      { requireBackground: true, hasBackground: false },
    );
    expect(issues.some((issue) => issue.code === "BACKGROUND_REQUIRED")).toBe(true);
  });

  it("requires word file and resolves placeholders from word content", () => {
    const refs = collectFieldReferences({
      editor: "WORD",
      fileName: "wcr.docx",
      placeholders: ["Customer_Name", "Plant_Capacity"],
    });
    expect([...refs.fieldKeys].sort()).toEqual(["Customer_Name", "Plant_Capacity"]);

    const missingFile = validateTemplateContent(
      { editor: "WORD", fileName: null, placeholders: [] },
      [baseField({})],
      { requireWordFile: true, hasWordFile: false },
    );
    expect(missingFile.some((issue) => issue.code === "WORD_FILE_REQUIRED")).toBe(true);

    const unknownKey = validateTemplateContent(
      { editor: "WORD", fileName: "wcr.docx", placeholders: ["Missing_Key"] },
      [baseField({})],
      { requireWordFile: true, hasWordFile: true },
    );
    expect(unknownKey.some((issue) => issue.code === "UNKNOWN_FIELD_KEY")).toBe(true);
  });
});
