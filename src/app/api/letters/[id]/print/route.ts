import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { buildPrintLetterPdf, getOfficialLetterById, LetterServiceError } from "@/lib/letter-service";
import { pdfInlineResponse } from "@/lib/pdf-cache";
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
    const pdf = await buildPrintLetterPdf(prisma, id);
    return pdfInlineResponse(pdf, `${letter.letterSerialNumber ?? "letter-draft"} print`, {
      privateCache: false,
    });
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
