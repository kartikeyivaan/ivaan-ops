import { z } from "zod";

export const setFieldEntrySchema = z.object({
  fieldId: z.string().uuid(),
  sortOrder: z.number().int().min(0),
  isRequired: z.boolean().optional(),
});

export const setFieldConfigSchema = z.object({
  fields: z.array(setFieldEntrySchema),
});

export type SetFieldConfig = z.infer<typeof setFieldConfigSchema>;
export type SetFieldEntry = z.infer<typeof setFieldEntrySchema>;

export function emptySetFieldConfig(): SetFieldConfig {
  return { fields: [] };
}

export function parseSetFieldConfig(raw: unknown): SetFieldConfig {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return emptySetFieldConfig();
  }
  return setFieldConfigSchema.parse(raw);
}
