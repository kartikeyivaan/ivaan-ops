import { describe, expect, it } from "vitest";
import type { DocGenField } from "@prisma/client";
import { compileSharedFieldConfig } from "@/lib/doc-gen-shared-fields";
import type { TemplateContent } from "@/lib/doc-gen-template-content";

const field = (overrides: Partial<DocGenField>): DocGenField =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "22222222-2222-4222-8222-222222222222",
    fieldKey: "Customer_Name",
    label: "Customer Name",
    inputType: "TEXT",
    configurationJson: {},
    isRequiredDefault: true,
    defaultValue: null,
    helpText: null,
    placeholder: null,
    status: "ACTIVE",
    createdById: "33333333-3333-4333-8333-333333333333",
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DocGenField;

describe("compileSharedFieldConfig", () => {
  it("unions fields across templates and preserves sort order", () => {
    const nameField = field({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fieldKey: "Customer_Name",
    });
    const consumerField = field({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fieldKey: "Consumer_No",
      label: "Consumer No",
    });
    const fieldsById = new Map([
      [nameField.id, nameField],
      [consumerField.id, consumerField],
    ]);

    const contentA: TemplateContent = {
      editor: "CANVAS",
      pages: [
        {
          pageIndex: 0,
          widthPt: 612,
          heightPt: 792,
          elements: [
            {
              kind: "field",
              id: "el-1",
              fieldId: nameField.id,
              fieldKey: nameField.fieldKey,
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              fontSize: 11,
              align: "left",
            },
          ],
        },
      ],
    };

    const contentB: TemplateContent = {
      editor: "CANVAS",
      pages: [
        {
          pageIndex: 0,
          widthPt: 612,
          heightPt: 792,
          elements: [
            {
              kind: "field",
              id: "el-2",
              fieldId: consumerField.id,
              fieldKey: consumerField.fieldKey,
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              fontSize: 11,
              align: "left",
            },
          ],
        },
      ],
    };

    const existing = {
      fields: [
        { fieldId: consumerField.id, sortOrder: 0, isRequired: true },
        { fieldId: nameField.id, sortOrder: 1 },
      ],
    };

    const compiled = compileSharedFieldConfig([contentA, contentB], existing, fieldsById);
    expect(compiled.fields.map((row) => row.fieldId)).toEqual([consumerField.id, nameField.id]);
    expect(compiled.fields[0]?.isRequired).toBe(true);
  });
});
