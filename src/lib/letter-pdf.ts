import PDFDocument from "pdfkit";
import { formatLetterDate } from "@/lib/utils";
import {
  letterHtmlToBlocks,
  type LetterInline,
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
