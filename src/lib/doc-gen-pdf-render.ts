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

/** Insert spaces so labels/values do not glue together (e.g. Name:Kartikey, 123Address). */
function spacedFieldValue(html: string, matchStart: number, matchEnd: number, value: string): string {
  if (!value) return value;
  let out = value;
  const before = matchStart > 0 ? html[matchStart - 1]! : "";
  const after = matchEnd < html.length ? html[matchEnd]! : "";
  if ((before === ":" || /[A-Za-z0-9]/.test(before)) && !/^\s/.test(out)) {
    out = ` ${out}`;
  }
  if (/[A-Za-z0-9]/.test(after) && !/\s$/.test(out)) {
    out = `${out} `;
  }
  return out;
}

export function applyFieldValuesToRichHtml(html: string, values: FieldValueMap): string {
  let result = html.replace(
    /<span[^>]*data-doc-gen-field="[0-9a-f-]{36}"[^>]*data-doc-gen-key="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi,
    (match, fieldKey: string, offset: number) =>
      spacedFieldValue(html, offset, offset + match.length, escapeHtml(values[fieldKey] ?? "")),
  );
  result = result.replace(/\{([A-Z][A-Za-z0-9_]*)\}/g, (match, fieldKey: string, offset: number) =>
    spacedFieldValue(
      result,
      offset,
      offset + match.length,
      escapeHtml(values[fieldKey] ?? `{${fieldKey}}`),
    ),
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

function measureInlineWidth(
  doc: PDFKit.PDFDocument,
  fonts: ReturnType<typeof setupFonts>,
  parts: RichInline[],
  fontSize: number,
): number {
  doc.fontSize(fontSize);
  return parts.reduce((sum, part) => {
    doc.font(part.bold ? fonts.bold : fonts.regular);
    return sum + doc.widthOfString(part.text);
  }, 0);
}

/**
 * Draw a single visual line. Avoid PDFKit `continued` + center/right alignment —
 * that stacks each fragment on the same edge and causes overlaps (e.g. Date over 21/Oct/2026).
 */
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
  const lineHeight = options.fontSize + options.lineGap;
  doc.fillColor("#20242E").fontSize(options.fontSize);

  if (cleaned.length === 0) {
    return y + lineHeight;
  }

  const sameStyle = cleaned.every(
    (part) =>
      Boolean(part.bold) === Boolean(cleaned[0]!.bold) &&
      Boolean(part.underline) === Boolean(cleaned[0]!.underline),
  );

  // Uniform style: one PDFKit call (supports wrapping + alignment reliably).
  if (sameStyle) {
    doc.font(cleaned[0]!.bold ? fonts.bold : fonts.regular).text(
      cleaned.map((part) => part.text).join(""),
      x,
      y,
      {
        width,
        align: textAlign === "justify" ? "justify" : textAlign,
        underline: Boolean(cleaned[0]!.underline),
        lineGap: options.lineGap,
        paragraphGap: 0,
      },
    );
    return doc.y;
  }

  // Mixed styles + left: continued runs are safe for left align.
  if (textAlign === "left" || textAlign === "justify") {
    cleaned.forEach((part, index) => {
      doc.font(part.bold ? fonts.bold : fonts.regular);
      const textOptions: PDFKit.Mixins.TextOptions = {
        width,
        align: "left",
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

  // Mixed styles + center/right: place fragments left-to-right at a computed start X.
  const totalWidth = measureInlineWidth(doc, fonts, cleaned, options.fontSize);
  let cursorX =
    textAlign === "right" ? x + Math.max(0, width - totalWidth) : x + Math.max(0, (width - totalWidth) / 2);
  for (const part of cleaned) {
    doc.font(part.bold ? fonts.bold : fonts.regular);
    const partWidth = doc.widthOfString(part.text);
    doc.text(part.text, cursorX, y, {
      lineBreak: false,
      underline: Boolean(part.underline),
    });
    cursorX += partWidth;
  }
  return y + lineHeight;
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
  const blankLineHeight = options.fontSize + options.lineGap;
  hardLines.forEach((lineParts) => {
    const isBlank = lineParts.every((part) => !part.text.replace(/\s/g, ""));
    if (isBlank) {
      cursorY += blankLineHeight;
      return;
    }
    cursorY = drawRichLine(doc, fonts, lineParts, x, cursorY, width, options);
  });
  return cursorY;
}

/** Matches letter-editor `[&_p]:my-1` (0.25rem ≈ 3pt). */
const EDITOR_PARA_MARGIN_PT = 3;

function isBlankParagraph(
  block: Extract<ReturnType<typeof letterHtmlToBlocks>[number], { type: "p" }>,
): boolean {
  return !block.children.map((part) => part.text).join("").replace(/\s/g, "");
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
  // CSS-like margin collapse between consecutive paragraphs (editor my-1 collapses).
  let pendingMarginPt = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const restAreBlank = blocks.slice(index).every(
      (row) => row.type === "p" && isBlankParagraph(row),
    );

    if (block.type === "p") {
      const indent = block.paddingLeftPt ?? 0;
      const fontSize = block.fontSize ?? 11;
      const lineGap =
        block.lineHeight && block.lineHeight > 1
          ? Math.max(0, (block.lineHeight - 1) * fontSize)
          : Math.max(2, fontSize * 0.25);
      const blank = isBlankParagraph(block);
      const marginTopPt = block.marginTopPt ?? EDITOR_PARA_MARGIN_PT;
      const marginBottomPt = block.marginBottomPt ?? EDITOR_PARA_MARGIN_PT;
      const collapsedGap = Math.max(pendingMarginPt, marginTopPt);

      // Trailing blank lines that would force an empty next page — drop them.
      if (blank && restAreBlank && y + collapsedGap + fontSize + lineGap > pageBottom - 28) {
        break;
      }

      if (y + collapsedGap > pageBottom - 28) {
        if (restAreBlank) break;
        doc.addPage();
        y = marginTop;
        pendingMarginPt = 0;
      } else {
        y += collapsedGap;
      }

      const usableWidth = Math.max(48, contentWidth - indent);
      if (blank) {
        // One editor line box (leading), not an inflated 16pt spacer.
        y += fontSize + lineGap;
        pendingMarginPt = marginBottomPt;
        continue;
      }
      y = drawRichParagraph(doc, fonts, block.children, marginLeft + indent, y, usableWidth, {
        align: block.align,
        fontSize,
        lineGap,
      });
      pendingMarginPt = marginBottomPt;
      continue;
    }

    y += pendingMarginPt;
    pendingMarginPt = 0;
    if (y > pageBottom - 28) {
      doc.addPage();
      y = marginTop;
    }
    if (block.type === "ul" || block.type === "ol") {
      block.items.forEach((item, itemIndex) => {
        const marker = block.type === "ol" ? `${itemIndex + 1}. ` : "• ";
        const parts = [{ text: marker, bold: false as const }, ...item];
        y = drawRichParagraph(doc, fonts, parts, marginLeft, y, contentWidth, {
          fontSize: 11,
          lineGap: Math.max(2, 11 * 0.25),
        });
        y += EDITOR_PARA_MARGIN_PT;
      });
      pendingMarginPt = EDITOR_PARA_MARGIN_PT;
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
