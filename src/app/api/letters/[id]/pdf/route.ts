import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { getOfficialLetterById, getOfficialLetterPdfBytes } from "@/lib/letter-service";
import { pdfInlineResponse } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
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

  const pdf = await getOfficialLetterPdfBytes(prisma, id);
  if (!pdf) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Stored PDF is not available for this letter." },
      { status: 404 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  return pdfInlineResponse(pdf, letter.letterSerialNumber ?? "letter-draft", {
    download,
    privateCache: false,
  });
}
