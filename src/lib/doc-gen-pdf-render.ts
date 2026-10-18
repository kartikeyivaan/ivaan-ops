import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { PDFDocument as PdfLibDocument, rgb } from "pdf-lib";
import type { TemplateContent } from "@/lib/doc-gen-template-content";
import type { PageConfiguration } from "@/lib/doc-gen-template-content";
import { letterHtmlToBlocks, sanitizeLetterHtml } from "@/lib/letter-content";
import { setupFonts, createDocOptions } from "@/lib/pdf-theme";

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

function drawRichTextPdf(html: string, pageConfig: PageConfiguration): Promise<Buffer> {
  const doc = new PDFDocument(createDocOptions(pageConfig.orientation === "landscape"));
  const fonts = setupFonts(doc);
  const marginLeft = (pageConfig.marginsMm.left * 72) / 25.4;
  const marginTop = (pageConfig.marginsMm.top * 72) / 25.4;
  const marginBottom = (pageConfig.marginsMm.bottom * 72) / 25.4;
  let y = marginTop;
  const width =
    doc.page.width - marginLeft - (pageConfig.marginsMm.right * 72) / 25.4;
  const pageBottom = doc.page.height - marginBottom;

  const blocks = letterHtmlToBlocks(sanitizeLetterHtml(html));
  for (const block of blocks) {
    if (y > pageBottom - 24) {
      doc.addPage();
      y = marginTop;
    }
    if (block.type === "p") {
      const line = block.children.map((part) => part.text).join("");
      doc
        .font(fonts.regular)
        .fontSize(11)
        .fillColor("#20242E")
        .text(line || " ", marginLeft, y, {
          width,
          align: (block.align as "left" | "center" | "right" | "justify") ?? "left",
        });
      y = doc.y + 6;
      continue;
    }
    if (block.type === "ul" || block.type === "ol") {
      block.items.forEach((item, index) => {
        const prefix = block.type === "ol" ? `${index + 1}. ` : "• ";
        const line = prefix + item.map((part) => part.text).join("");
        doc.font(fonts.regular).fontSize(11).text(line, marginLeft, y, { width });
        y = doc.y + 4;
      });
      y += 4;
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
