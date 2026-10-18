import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import {
  buildPrintLetterPdf,
  getOfficialLetterById,
  LetterServiceError,
} from "@/lib/letter-service";
import { officialLetterPrintContentVersion } from "@/lib/pdf-content-versions";
import { pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const letter = await getOfficialLetterById(prisma, id);
  if (!letter) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Letter not found." }, { status: 404 });
  }

  try {
    const source = await prisma.officialLetter.findFirst({
      where: {
        id,
        company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
      },
      select: {
        id: true,
        updatedAt: true,
        status: true,
        letterDate: true,
        content: true,
        signatoryName: true,
        signatoryDesignation: true,
        signatureImageData: true,
        stampImageData: true,
        stampEnabled: true,
        printSignatureEnabled: true,
        printContentTopOffsetMm: true,
      },
    });
    if (!source) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Letter not found." }, { status: 404 });
    }

    const pdf = await resolveStoredPdf(prisma, {
      documentType: "OFFICIAL_LETTER_PRINT",
      documentId: source.id,
      contentVersion: officialLetterPrintContentVersion(source),
      generate: () => buildPrintLetterPdf(prisma, id),
    });
    return pdfInlineResponse(pdf, `${letter.letterSerialNumber ?? "letter-draft"} print`);
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
