import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessToday } from "@/lib/business-dates";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { duplicateOfficialLetter, LetterServiceError } from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { duplicateOfficialLetterSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  let letterDate = getBusinessToday();
  try {
    const body = await request.json();
    const parsed = duplicateOfficialLetterSchema.safeParse(body);
    if (parsed.success && parsed.data.letterDate) {
      letterDate = parsed.data.letterDate;
    }
  } catch {
    // Empty body is allowed; default to today.
  }

  try {
    const letter = await duplicateOfficialLetter(prisma, id, session.user.id, letterDate);
    return NextResponse.json(letter, { status: 201 });
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
