import PDFDocument from "pdfkit";

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
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.fontSize(16).text(input.title, { align: "center" });
  if (input.subtitle) {
    doc.fontSize(10).text(input.subtitle, { align: "center" });
  }
  doc.moveDown();

  const startX = 40;
  let y = doc.y;
  const rowHeight = 16;
  doc.fontSize(9);

  input.columns.forEach((column, index) => {
    const x =
      startX + input.columns.slice(0, index).reduce((sum, item) => sum + item.width, 0);
    doc.text(column.header, x, y, { width: column.width, align: column.align ?? "left" });
  });

  y += rowHeight;
  doc.moveTo(startX, y).lineTo(800, y).stroke();
  y += 4;

  for (const row of input.rows) {
    if (y > 540) {
      doc.addPage({ layout: "landscape", margin: 40 });
      y = 40;
    }

    row.forEach((value, index) => {
      const x =
        startX + input.columns.slice(0, index).reduce((sum, item) => sum + item.width, 0);
      doc.text(value, x, y, {
        width: input.columns[index]?.width ?? 80,
        align: input.columns[index]?.align ?? "left",
      });
    });
    y += rowHeight;
  }

  return collectPdfBuffer(doc);
}
