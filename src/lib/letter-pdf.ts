import PDFDocument from "pdfkit";
import { formatLetterDate } from "@/lib/utils";
import {
  letterHtmlToBlocks,
  type LetterInline,
  type LetterTableCell,
} from "@/lib/letter-content";
import {
  CONTENT_LEFT,
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  MARGIN_X,
  companyLogo,
  companyStamp,
  createDocOptions,
  drawFooter,
  drawLetterheadBand,
  resolvePalette,
  resolveProfile,
  setupFonts,
  type CompanyProfileSource,
  type DocContext,
} from "@/lib/pdf-theme";

export type LetterPdfSource = {
  letterDate: Date;
  content: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImageData?: string | null;
  stampImageData?: string | null;
  stampEnabled: boolean;
  printSignatureEnabled: boolean;
  printContentTopOffsetMm: number;
  company: CompanyProfileSource & {
    name: string;
    code: string;
  };
};

export type LetterPdfMode = "official" | "print";

function imageDataUrlToBuffer(value: string | null | undefined): Buffer | null {
  if (!value?.startsWith("data:image/")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) return null;
  try {
    return Buffer.from(value.slice(comma + 1), "base64");
  } catch {
    return null;
  }
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function signatureBlockHeight(signature: Buffer | null, stamp: Buffer | null): number {
  const imageH = signature ? 52 : 28;
  const textH = 44;
  return imageH + textH + (stamp ? 22 : 0);
}

function drawInlines(
  ctx: DocContext,
  parts: LetterInline[],
  x: number,
  y: number,
  width: number,
  align?: string,
) {
  const { doc, fonts, palette } = ctx;
  const textAlign =
    align === "center" || align === "right" || align === "justify" ? align : "left";
  doc.fillColor(palette.ink).fontSize(11);
  if (parts.length === 0) {
    doc.font(fonts.regular).text(" ", x, y, { width, align: textAlign });
    return doc.y;
  }

  parts.forEach((part, index) => {
    doc.font(part.bold ? fonts.bold : fonts.regular);
    const options: PDFKit.Mixins.TextOptions = {
      width,
      align: textAlign,
      continued: index < parts.length - 1,
      underline: Boolean(part.underline),
    };
    if (index === 0) doc.text(part.text, x, y, options);
    else doc.text(part.text, options);
  });
  return doc.y;
}

function ensureSpace(ctx: DocContext, pageBottom: number, needed: number, top: number) {
  if (ctx.doc.y + needed <= pageBottom) return;
  ctx.doc.addPage();
  ctx.doc.y = top;
}

const TABLE_CELL_PAD = 4;
const TABLE_FONT_SIZE = 10;

function inlinesPlain(parts: LetterInline[]): string {
  return parts.map((part) => part.text).join("");
}

function measureTableCellHeight(
  ctx: DocContext,
  cell: LetterTableCell,
  width: number,
): number {
  const { doc, fonts } = ctx;
  const innerW = Math.max(12, width - TABLE_CELL_PAD * 2);
  doc.font(cell.header ? fonts.bold : fonts.regular).fontSize(TABLE_FONT_SIZE);
  const text = inlinesPlain(cell.children).trim() || " ";
  return doc.heightOfString(text, { width: innerW }) + TABLE_CELL_PAD * 2;
}

type TableSlot = {
  cell: LetterTableCell;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

function layoutLetterTable(rows: LetterTableCell[][]): {
  colCount: number;
  rowCount: number;
  slots: TableSlot[];
  rowHeights: number[];
} {
  const colCount = Math.max(
    1,
    ...rows.map((row) => row.reduce((sum, cell) => sum + (cell.colspan ?? 1), 0)),
  );
  const rowCount = rows.length;
  const occupied = new Set<string>();
  const slots: TableSlot[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    let colIndex = 0;
    for (const cell of rows[rowIndex]!) {
      while (occupied.has(`${rowIndex},${colIndex}`)) colIndex += 1;
      const colSpan = cell.colspan ?? 1;
      const rowSpan = cell.rowspan ?? 1;
      slots.push({ cell, col: colIndex, row: rowIndex, colSpan, rowSpan });
      for (let dr = 0; dr < rowSpan; dr += 1) {
        for (let dc = 0; dc < colSpan; dc += 1) {
          occupied.add(`${rowIndex + dr},${colIndex + dc}`);
        }
      }
      colIndex += colSpan;
    }
  }

  return { colCount, rowCount, slots, rowHeights: new Array(rowCount).fill(0) };
}

function drawLetterTable(
  ctx: DocContext,
  rows: LetterTableCell[][],
  pageBottom: number,
  contentTop: number,
) {
  const { doc, palette } = ctx;
  if (rows.length === 0) return;

  const layout = layoutLetterTable(rows);
  const colWidth = CONTENT_WIDTH / layout.colCount;

  layout.slots.forEach((slot) => {
    const cellWidth = colWidth * slot.colSpan;
    const minSlice = measureTableCellHeight(ctx, slot.cell, cellWidth) / slot.rowSpan;
    for (let dr = 0; dr < slot.rowSpan; dr += 1) {
      const rowIndex = slot.row + dr;
      layout.rowHeights[rowIndex] = Math.max(layout.rowHeights[rowIndex]!, minSlice);
    }
  });

  let y = doc.y;
  for (let rowIndex = 0; rowIndex < layout.rowCount; rowIndex += 1) {
    const rowHeight = layout.rowHeights[rowIndex]!;
    ensureSpace(ctx, pageBottom, rowHeight + 2, contentTop);
    y = doc.y;

    layout.slots
      .filter((slot) => slot.row === rowIndex)
      .forEach((slot) => {
        const x = CONTENT_LEFT + slot.col * colWidth;
        const width = colWidth * slot.colSpan;
        const height = layout.rowHeights
          .slice(slot.row, slot.row + slot.rowSpan)
          .reduce((sum, value) => sum + value, 0);
        doc
          .rect(x, y, width, height)
          .lineWidth(0.5)
          .strokeColor(palette.border)
          .stroke();
        const cellParts = slot.cell.header
          ? slot.cell.children.map((part) => ({ ...part, bold: part.bold ?? true }))
          : slot.cell.children;
        drawInlines(
          ctx,
          cellParts,
          x + TABLE_CELL_PAD,
          y + TABLE_CELL_PAD,
          width - TABLE_CELL_PAD * 2,
          slot.cell.align,
        );
      });

    doc.y = y + rowHeight;
    y = doc.y;
  }
  doc.y += 6;
}

function drawLetterBody(
  ctx: DocContext,
  html: string,
  startY: number,
  pageBottom: number,
  contentTop: number,
) {
  const { doc, fonts, palette } = ctx;
  const blocks = letterHtmlToBlocks(html);
  doc.y = startY;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const isLast = index === blocks.length - 1;
    if (block.type === "p") {
      ensureSpace(ctx, pageBottom, 18, contentTop);
      const y = doc.y;
      drawInlines(ctx, block.children, CONTENT_LEFT, y, CONTENT_WIDTH, block.align);
      if (!isLast) doc.y += 8;
      continue;
    }

    if (block.type === "table") {
      drawLetterTable(ctx, block.rows, pageBottom, contentTop);
      if (!isLast) doc.y += 4;
      continue;
    }

    const marker = block.type === "ol";
    block.items.forEach((item, itemIndex) => {
      ensureSpace(ctx, pageBottom, 18, contentTop);
      const y = doc.y;
      doc.font(fonts.regular).fontSize(11).fillColor(palette.ink);
      doc.text(marker ? `${itemIndex + 1}.` : "•", CONTENT_LEFT, y, { width: 18 });
      drawInlines(ctx, item, CONTENT_LEFT + 20, y, CONTENT_WIDTH - 20);
      doc.y += 4;
    });
    if (!isLast) doc.y += 6;
  }
}

function drawSignatureArea(
  ctx: DocContext,
  letter: LetterPdfSource,
  options: { includeSignature: boolean; includeStamp: boolean },
  pageBottom: number,
  contentTop: number,
) {
  const { doc, fonts, palette } = ctx;
  const signature = options.includeSignature ? imageDataUrlToBuffer(letter.signatureImageData) : null;
  const stamp = options.includeStamp
    ? imageDataUrlToBuffer(letter.stampImageData) ?? companyStamp(letter.company.code)
    : null;
  const needed = signatureBlockHeight(signature, stamp);
  ensureSpace(ctx, pageBottom, needed, contentTop);

  let y = doc.y + 10;
  if (y + needed > pageBottom) {
    doc.addPage();
    y = contentTop;
  }

  const signLeft = CONTENT_LEFT;
  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(`For ${letter.company.name}`, signLeft, y, {
    width: 260,
    align: "left",
  });
  y = doc.y + 6;

  if (signature) {
    doc.image(signature, signLeft, y, { fit: [160, 48] });
    y += 52;
  } else {
    y += 28;
  }

  doc.font(fonts.bold).fontSize(10).fillColor(palette.ink).text(letter.signatoryName, signLeft, y, {
    width: 260,
  });
  y = doc.y + 1;
  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(letter.signatoryDesignation, signLeft, y, {
    width: 260,
  });

  if (stamp) {
    const stampX = signLeft + 150;
    const stampY = Math.max(y - 70, contentTop);
    doc.image(stamp, stampX, stampY, { fit: [92, 92] });
  }
}

export async function generateOfficialLetterPdf(
  letter: LetterPdfSource,
  mode: LetterPdfMode = "official",
): Promise<Buffer> {
  const printMode = mode === "print";
  const topOffset = printMode ? Math.max(0, mmToPt(letter.printContentTopOffsetMm)) : MARGIN_TOP;
  const doc = new PDFDocument({
    ...createDocOptions(),
    margins: {
      top: printMode ? topOffset : MARGIN_TOP,
      left: MARGIN_X,
      right: MARGIN_X,
      bottom: printMode ? 56 : MARGIN_BOTTOM,
    },
  });
  const fonts = setupFonts(doc);
  const palette = resolvePalette(letter.company.code);
  const ctx: DocContext = { doc, palette, fonts };
  const profile = resolveProfile(letter.company);
  const pageBottom = doc.page.height - (printMode ? 56 : MARGIN_BOTTOM);
  const dateLabel = formatLetterDate(letter.letterDate);

  let contentTop = topOffset;
  if (!printMode) {
    const logo = companyLogo(letter.company.code);
    contentTop = drawLetterheadBand(ctx, {
      logo,
      companyName: letter.company.name,
      profile,
      dateLabel,
    });
  } else {
    doc.font(fonts.regular).fontSize(11).fillColor(palette.ink).text(dateLabel, CONTENT_LEFT, topOffset, {
      width: CONTENT_WIDTH,
      align: "right",
    });
    contentTop = doc.y + 18;
  }

  drawLetterBody(ctx, letter.content, contentTop, pageBottom, contentTop);

  drawSignatureArea(
    ctx,
    letter,
    {
      includeSignature: printMode ? letter.printSignatureEnabled : true,
      includeStamp: printMode ? false : letter.stampEnabled,
    },
    pageBottom,
    contentTop,
  );

  if (!printMode) {
    const companyLine = [letter.company.name, profile.phone, profile.email].filter(Boolean).join("  ||  ");
    drawFooter(ctx, companyLine);
  }

  return collectPdfBuffer(doc);
}
