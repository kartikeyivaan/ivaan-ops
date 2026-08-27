import { PdfDocumentType, type PrismaClient } from "@prisma/client";

export function pdfContentVersion(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part === null || part === undefined ? "" : String(part)))
    .join("|");
}

export async function resolveStoredPdf(
  prisma: PrismaClient,
  input: {
    documentType: PdfDocumentType;
    documentId: string;
    variant?: string;
    contentVersion: string;
    generate: () => Promise<Buffer>;
  },
): Promise<Buffer> {
  const variant = input.variant ?? "";
  const cached = await prisma.storedPdf.findUnique({
    where: {
      documentType_documentId_variant: {
        documentType: input.documentType,
        documentId: input.documentId,
        variant,
      },
    },
    select: { contentVersion: true, pdfData: true },
  });

  if (cached?.contentVersion === input.contentVersion) {
    return Buffer.from(cached.pdfData);
  }

  const pdf = await input.generate();
  const pdfBytes = new Uint8Array(pdf);
  await prisma.storedPdf.upsert({
    where: {
      documentType_documentId_variant: {
        documentType: input.documentType,
        documentId: input.documentId,
        variant,
      },
    },
    create: {
      documentType: input.documentType,
      documentId: input.documentId,
      variant,
      contentVersion: input.contentVersion,
      pdfData: pdfBytes,
    },
    update: {
      contentVersion: input.contentVersion,
      pdfData: pdfBytes,
      generatedAt: new Date(),
    },
  });

  return pdf;
}

export function pdfInlineResponse(
  pdf: Buffer,
  filename: string,
  options?: { asciiName?: string; privateCache?: boolean },
) {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  const asciiName =
    options?.asciiName ?? safeName.replace(/[^\x20-\x7E]/g, "_");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(
        `${safeName}.pdf`,
      )}`,
      "Cache-Control": options?.privateCache === false ? "private, no-store" : "private, max-age=3600",
    },
  });
}
