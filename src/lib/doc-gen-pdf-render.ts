import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { PDFDocument as PdfLibDocument, rgb } from "pdf-lib";
import type { TemplateContent } from "@/lib/doc-gen-template-content";
import type { PageConfiguration } from "@/lib/doc-gen-template-content";
import { letterHtmlToBlocks, sanitizeLetterHtml } from "@/lib/letter-content";
import { setupFonts } from "@/lib/pdf-theme";

const FONT_PATH = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");

export type FieldValueMap = Record<string, string>;

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function applyFieldValuesToRichHtml(html: string, values: FieldValueMap): string {
  let result = html.replace(
    /<span[^>]*data-doc-gen-field="[0-9a-f-]{36}"[^>]*data-doc-gen-key="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi,
    (_match, fieldKey: string) => escapeHtml(values[fieldKey] ?? ""),
  );
  result = result.replace(/\{([A-Z][A-Za-z0-9_]*)\}/g, (_match, fieldKey: string) =>
    escapeHtml(values[fieldKey] ?? `{${fieldKey}}`),
  );
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type RichInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** Split inline runs on intentional hard breaks only (from <br>), never on soft HTML whitespace. */
function splitByHardBreaks(parts: RichInline[]): RichInline[][] {
  const lines: RichInline[][] = [[]];
  for (const part of parts) {
    const chunks = part.text.split("\n");
    chunks.forEach((chunk, index) => {
      if (index > 0) lines.push([]);
      if (!chunk) return;
      lines[lines.length - 1]!.push({
        ...part,
        text: chunk,
      });
    });
  }
  return lines.length ? lines : [[]];
}

function drawRichLine(
  doc: PDFKit.PDFDocument,
  fonts: ReturnType<typeof setupFonts>,
  parts: RichInline[],
  x: number,
  y: number,
  width: number,
  options: {
    align?: string;
    fontSize: number;
    lineGap: number;
  },
): number {
  const textAlign =
    options.align === "center" || options.align === "right" || options.align === "justify"
      ? options.align
      : "left";
  const cleaned = parts.filter((part) => part.text.length > 0);
  doc.fillColor("#20242E").fontSize(options.fontSize);

  if (cleaned.length === 0) {
    doc.font(fonts.regular).text(" ", x, y, {
      width,
      align: textAlign,
      lineGap: options.lineGap,
      paragraphGap: 0,
    });
    return doc.y;
  }

  // Same style throughout → one draw call (best alignment + wrapping).
  const sameStyle = cleaned.every(
    (part) =>
      Boolean(part.bold) === Boolean(cleaned[0]!.bold) &&
      Boolean(part.underline) === Boolean(cleaned[0]!.underline),
  );
  if (sameStyle) {
    doc.font(cleaned[0]!.bold ? fonts.bold : fonts.regular).text(
      cleaned.map((part) => part.text).join(""),
      x,
      y,
      {
        width,
        align: textAlign,
        underline: Boolean(cleaned[0]!.underline),
        lineGap: options.lineGap,
        paragraphGap: 0,
      },
    );
    return doc.y;
  }

  // Mixed formatting: keep on one flowing line via continued runs (no extra hard breaks).
  cleaned.forEach((part, index) => {
    doc.font(part.bold ? fonts.bold : fonts.regular);
    const textOptions: PDFKit.Mixins.TextOptions = {
      width,
      align: textAlign,
      continued: index < cleaned.length - 1,
      underline: Boolean(part.underline),
      lineGap: options.lineGap,
      paragraphGap: 0,
    };
    if (index === 0) doc.text(part.text, x, y, textOptions);
    else doc.text(part.text, textOptions);
  });
  return doc.y;
}

function drawRichParagraph(
  doc: PDFKit.PDFDocument,
  fonts: ReturnType<typeof setupFonts>,
  parts: RichInline[],
  x: number,
  y: number,
  width: number,
  options: {
    align?: string;
    fontSize: number;
    lineGap: number;
  },
): number {
  const hardLines = splitByHardBreaks(parts);
  let cursorY = y;
  hardLines.forEach((lineParts, index) => {
    cursorY = drawRichLine(doc, fonts, lineParts, x, cursorY, width, options);
    if (index < hardLines.length - 1) cursorY += options.lineGap;
  });
  return cursorY;
}

function drawRichTextPdf(html: string, pageConfig: PageConfiguration): Promise<Buffer> {
  // Use pageConfiguration margins only — avoid stacking theme margins on top.
  const doc = new PDFDocument({
    size: pageConfig.pageSize,
    layout: pageConfig.orientation === "landscape" ? "landscape" : "portrait",
    bufferPages: true,
    autoFirstPage: true,
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
  });
  const fonts = setupFonts(doc);
  const marginLeft = mmToPt(pageConfig.marginsMm.left);
  const marginRight = mmToPt(pageConfig.marginsMm.right);
  const marginTop = mmToPt(pageConfig.marginsMm.top);
  const marginBottom = mmToPt(pageConfig.marginsMm.bottom);
  let y = marginTop;
  const contentWidth = Math.max(72, doc.page.width - marginLeft - marginRight);
  const pageBottom = doc.page.height - marginBottom;

  const blocks = letterHtmlToBlocks(sanitizeLetterHtml(html));
  for (const block of blocks) {
    if (y > pageBottom - 28) {
      doc.addPage();
      y = marginTop;
    }
    if (block.type === "p") {
      y += block.marginTopPt ?? 0;
      const indent = block.paddingLeftPt ?? 0;
      const fontSize = block.fontSize ?? 11;
      const lineGap =
        block.lineHeight && block.lineHeight > 1
          ? Math.max(0, (block.lineHeight - 1) * fontSize)
          : 2;
      const usableWidth = Math.max(48, contentWidth - indent);
      y = drawRichParagraph(doc, fonts, block.children, marginLeft + indent, y, usableWidth, {
        align: block.align,
        fontSize,
        lineGap,
      });
      y += block.marginBottomPt ?? 10;
      continue;
    }
    if (block.type === "ul" || block.type === "ol") {
      block.items.forEach((item, index) => {
        const prefix = block.type === "ol" ? `${index + 1}. ` : "• ";
        const parts = [{ text: prefix, bold: false as const }, ...item];
        y = drawRichParagraph(doc, fonts, parts, marginLeft, y, contentWidth, {
          fontSize: 11,
          lineGap: 2,
        });
        y += 6;
      });
      y += 6;
    }
  }

  return collectPdfBuffer(doc);
}

async function loadEmbeddedFont(pdfDoc: PdfLibDocument) {
  try {
    const bytes = fs.readFileSync(FONT_PATH);
    return pdfDoc.embedFont(bytes, { subset: true });
  } catch {
    return pdfDoc.embedFont("Helvetica");
  }
}

function wrapText(text: string, maxWidth: number, font: { widthOfTextAtSize: (t: string, s: number) => number }, fontSize: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i += 1) {
    const next = `${line} ${words[i]!}`;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

async function renderCanvasPdf(
  content: Extract<TemplateContent, { editor: "CANVAS" | "PDF_BACKGROUND" }>,
  values: FieldValueMap,
  backgroundBytes: Buffer | null,
): Promise<Buffer> {
  let pdfDoc: PdfLibDocument;
  if (backgroundBytes) {
    pdfDoc = await PdfLibDocument.load(backgroundBytes, { ignoreEncryption: true });
  } else {
    pdfDoc = await PdfLibDocument.create();
    for (const page of content.pages) {
      pdfDoc.addPage([page.widthPt, page.heightPt]);
    }
  }

  const font = await loadEmbeddedFont(pdfDoc);
  const pages = pdfDoc.getPages();

  for (const pageDef of content.pages) {
    const page = pages[pageDef.pageIndex] ?? pages[0];
    if (!page) continue;
    const { height: pageHeight } = page.getSize();

    for (const element of pageDef.elements) {
      if (element.kind === "text") {
        const lines = wrapText(element.text, element.width, font, element.fontSize);
        let yTop = element.y;
        for (const line of lines) {
          const textWidth = font.widthOfTextAtSize(line, element.fontSize);
          let x = element.x;
          if (element.align === "center") x = element.x + (element.width - textWidth) / 2;
          if (element.align === "right") x = element.x + element.width - textWidth;
          const yPdf = pageHeight - yTop - element.fontSize;
          page.drawText(line, { x, y: yPdf, size: element.fontSize, font, color: rgb(0, 0, 0) });
          yTop += element.fontSize * 1.25;
        }
      } else if (element.kind === "field") {
        const value = values[element.fieldKey] ?? "";
        const lines = wrapText(value, element.width, font, element.fontSize);
        let yTop = element.y;
        for (const line of lines) {
          const textWidth = font.widthOfTextAtSize(line, element.fontSize);
          let x = element.x;
          if (element.align === "center") x = element.x + (element.width - textWidth) / 2;
          if (element.align === "right") x = element.x + element.width - textWidth;
          const yPdf = pageHeight - yTop - element.fontSize;
          page.drawText(line, { x, y: yPdf, size: element.fontSize, font, color: rgb(0, 0, 0) });
          yTop += element.fontSize * 1.25;
          if (yTop > element.y + element.height) break;
        }
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
}

export async function renderTemplatePreviewPdf(input: {
  content: TemplateContent;
  pageConfiguration: PageConfiguration;
  fieldValues: FieldValueMap;
  backgroundBytes?: Buffer | null;
}): Promise<Buffer> {
  if (input.content.editor === "RICH_TEXT") {
    const html = applyFieldValuesToRichHtml(input.content.html, input.fieldValues);
    return drawRichTextPdf(html, input.pageConfiguration);
  }
  return renderCanvasPdf(input.content, input.fieldValues, input.backgroundBytes ?? null);
}
