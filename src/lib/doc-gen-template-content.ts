import { z } from "zod";

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

const alignSchema = z.enum(["left", "center", "right"]);

export const canvasElementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    id: z.string().min(1),
    text: z.string(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    fontSize: z.number().finite().positive(),
    align: alignSchema.default("left"),
  }),
  z.object({
    kind: z.literal("field"),
    id: z.string().min(1),
    fieldId: z.string().uuid(),
    fieldKey: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    fontSize: z.number().finite().positive(),
    align: alignSchema.default("left"),
  }),
]);

export const canvasPageSchema = z.object({
  pageIndex: z.number().int().min(0),
  widthPt: z.number().finite().positive(),
  heightPt: z.number().finite().positive(),
  elements: z.array(canvasElementSchema),
});

export const templateContentSchema = z.discriminatedUnion("editor", [
  z.object({
    editor: z.literal("RICH_TEXT"),
    html: z.string(),
  }),
  z.object({
    editor: z.enum(["CANVAS", "PDF_BACKGROUND"]),
    pages: z.array(canvasPageSchema).min(1),
  }),
]);

export type TemplateContent = z.infer<typeof templateContentSchema>;
export type CanvasPage = z.infer<typeof canvasPageSchema>;
export type CanvasElement = z.infer<typeof canvasElementSchema>;

export const pageConfigurationSchema = z.object({
  pageSize: z.enum(["A4"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  marginsMm: z
    .object({
      top: z.number().min(0).default(20),
      right: z.number().min(0).default(20),
      bottom: z.number().min(0).default(20),
      left: z.number().min(0).default(20),
    })
    .default({ top: 20, right: 20, bottom: 20, left: 20 }),
});

export type PageConfiguration = z.infer<typeof pageConfigurationSchema>;

export function defaultTemplateContent(
  editorType: "RICH_TEXT" | "CANVAS" | "PDF_BACKGROUND",
): TemplateContent {
  if (editorType === "RICH_TEXT") {
    return { editor: "RICH_TEXT", html: "<p><br></p>" };
  }
  return {
    editor: editorType === "PDF_BACKGROUND" ? "PDF_BACKGROUND" : "CANVAS",
    pages: [
      {
        pageIndex: 0,
        widthPt: A4_WIDTH_PT,
        heightPt: A4_HEIGHT_PT,
        elements: [],
      },
    ],
  };
}

export function defaultPageConfiguration(): PageConfiguration {
  return pageConfigurationSchema.parse({});
}
