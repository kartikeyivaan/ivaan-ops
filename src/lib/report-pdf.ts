import PDFDocument from "pdfkit";
import { ISE_PALETTE, drawFooter, setupFonts, type DocContext } from "@/lib/pdf-theme";

export type PdfColumn = {
  header: string;
  width: number;
  align?: "left" | "right";
};

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function generateTabularReportPdf(input: {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: string[][];
}): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape", bufferPages: true });
  const fonts = setupFonts(doc);
  const palette = ISE_PALETTE;
  const ctx: DocContext = { doc, palette, fonts };

  const startX = 40;
  const tableWidth = input.columns.reduce((sum, col) => sum + col.width, 0);
  const pageBottom = doc.page.height - 60;

  doc.font(fonts.bold).fontSize(16).fillColor(palette.primary).text(input.title, startX, 40, {
    width: tableWidth,
    align: "left",
  });
  if (input.subtitle) {
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(input.subtitle, startX, doc.y + 1, {
      width: tableWidth,
    });
  }
  doc
    .moveTo(startX, doc.y + 4)
    .lineTo(startX + Math.min(tableWidth, 200), doc.y + 4)
    .lineWidth(2)
    .strokeColor(palette.accent)
    .stroke();

  const columnX = (index: number): number =>
    startX + input.columns.slice(0, index).reduce((sum, item) => sum + item.width, 0);

  const rowHeight = 18;
  const drawHeaderRow = (top: number): number => {
    doc.rect(startX, top, tableWidth, rowHeight).fill(palette.primary);
    doc.font(fonts.bold).fontSize(9).fillColor(palette.primaryText);
    input.columns.forEach((column, index) => {
      doc.text(column.header, columnX(index) + 4, top + 5, {
        width: column.width - 8,
        align: column.align ?? "left",
      });
    });
    return top + rowHeight;
  };

  let y = drawHeaderRow(doc.y + 10);
  doc.fontSize(8.5);

  input.rows.forEach((row, rowIndex) => {
    if (y + rowHeight > pageBottom) {
      doc.addPage({ layout: "landscape", margin: 40 });
      y = drawHeaderRow(40);
      doc.fontSize(8.5);
    }

    if (rowIndex % 2 === 1) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(palette.zebra);
    }

    doc.font(fonts.regular).fillColor(palette.ink);
    row.forEach((value, index) => {
      doc.text(value, columnX(index) + 4, y + 5, {
        width: (input.columns[index]?.width ?? 80) - 8,
        align: input.columns[index]?.align ?? "left",
      });
    });
    y += rowHeight;
    doc.moveTo(startX, y).lineTo(startX + tableWidth, y).lineWidth(0.4).strokeColor(palette.border).stroke();
  });

  drawFooter(ctx, input.subtitle ? `${input.title} — ${input.subtitle}` : input.title);

  return collectPdfBuffer(doc);
}
