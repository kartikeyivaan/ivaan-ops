import { NextResponse } from "next/server";
import { generateDispatchPdf } from "@/lib/dispatch-pdf";
import { dispatchInclude } from "@/lib/dispatch-service";
import { pdfContentVersion, pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";
import { verifyDispatchShareToken } from "@/lib/share-token";

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

// Public, unauthenticated delivery challan PDF access via a signed, self-expiring token.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const payload = token ? verifyDispatchShareToken(token) : null;

  if (!payload) {
    return invalidLinkResponse("This link is invalid or has expired.");
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: payload.dispatchId },
    include: dispatchInclude,
  });

  if (!dispatch || dispatch.status === "DRAFT" || dispatch.status === "CANCELLED") {
    return invalidLinkResponse("This delivery challan is no longer available.");
  }

  const pdf = await resolveStoredPdf(prisma, {
    documentType: "DISPATCH",
    documentId: dispatch.id,
    contentVersion: pdfContentVersion([dispatch.updatedAt.toISOString(), dispatch.status]),
    generate: () => generateDispatchPdf(dispatch),
  });

  const rawName = `${dispatch.dcNo} - ${dispatch.customer.customerName}`;
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

  const response = pdfInlineResponse(pdf, safeName, {
    asciiName: safeName.replace(/[^\x20-\x7E]/g, "_"),
    privateCache: false,
  });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
