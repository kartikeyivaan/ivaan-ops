import { NextResponse } from "next/server";
import { generateQuotationPdf } from "@/lib/quotation-pdf";
import { prisma } from "@/lib/prisma";
import { quotationInclude } from "@/lib/quotation-service";
import { verifyQuotationShareToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

function invalidLinkResponse(message: string) {
  return new NextResponse(message, {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// Public, unauthenticated quotation PDF access via a signed, self-expiring token
// (see src/lib/share-token.ts). The token is the only credential; there is no
// company/session check here by design so customers can open the link directly.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const payload = token ? verifyQuotationShareToken(token) : null;

  if (!payload) {
    return invalidLinkResponse("This link is invalid or has expired.");
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id: payload.quotationId },
    include: quotationInclude,
  });

  if (!quotation) {
    return invalidLinkResponse("This quotation is no longer available.");
  }

  const pdf = await generateQuotationPdf(quotation);

  const rawName = `${quotation.quotationNo} - ${quotation.customer.customerName}`;
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(
        `${safeName}.pdf`,
      )}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
