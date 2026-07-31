import { NextResponse } from "next/server";
import { generateProformaInvoicePdf } from "@/lib/pi-pdf";
import { piInclude } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { verifyProformaInvoiceShareToken } from "@/lib/share-token";

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

// Public, unauthenticated PI PDF access via a signed, self-expiring token.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const payload = token ? verifyProformaInvoiceShareToken(token) : null;

  if (!payload) {
    return invalidLinkResponse("This link is invalid or has expired.");
  }

  const pi = await prisma.proformaInvoice.findUnique({
    where: { id: payload.piId },
    include: piInclude,
  });

  if (!pi || pi.status === "DRAFT") {
    return invalidLinkResponse("This proforma invoice is no longer available.");
  }

  const pdf = await generateProformaInvoicePdf(pi);

  const rawName = `${pi.piNo} - ${pi.customer.customerName}`;
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
