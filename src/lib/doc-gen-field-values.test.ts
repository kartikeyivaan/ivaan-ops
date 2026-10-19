import { describe, expect, it } from "vitest";
import type { DocGenField } from "@prisma/client";
import type { CompiledSetField } from "@/lib/doc-gen-shared-fields";
import { validateFieldValues } from "@/lib/doc-gen-field-values";

const baseField = (overrides: Partial<DocGenField>): DocGenField =>
  ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: "22222222-2222-4222-8222-222222222222",
    fieldKey: "Test_Field",
    label: "Test Field",
    inputType: "TEXT",
    configurationJson: {},
    isRequiredDefault: false,
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

const compiledRow = (field: DocGenField, extra?: Partial<CompiledSetField>): CompiledSetField => ({
  fieldId: field.id,
  sortOrder: 0,
  fieldKey: field.fieldKey,
  label: field.label,
  inputType: field.inputType,
  configurationJson: field.configurationJson,
  isRequiredDefault: field.isRequiredDefault,
  defaultValue: field.defaultValue,
  helpText: field.helpText,
  placeholder: field.placeholder,
  ...extra,
});

describe("validateFieldValues", () => {
  it("flags required and invalid dropdown values", () => {
    const requiredField = baseField({
      fieldKey: "Customer_Name",
      label: "Customer Name",
      isRequiredDefault: true,
    });
    const dropdownField = baseField({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fieldKey: "Scheme",
      label: "Scheme",
      inputType: "DROPDOWN",
      configurationJson: { options: ["A", "B"] },
    });

    const fieldsById = new Map([
      [requiredField.id, requiredField],
      [dropdownField.id, dropdownField],
    ]);
    const compiled = [compiledRow(requiredField), compiledRow(dropdownField)];

    const issues = validateFieldValues(compiled, { Scheme: "C" }, fieldsById);
    expect(issues.some((issue) => issue.fieldKey === "Customer_Name")).toBe(true);
    expect(issues.some((issue) => issue.fieldKey === "Scheme")).toBe(true);
  });
});
