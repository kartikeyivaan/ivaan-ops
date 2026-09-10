import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { getOfficialLetterById, issueOfficialLetter, LetterServiceError } from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { createOfficialLetterSchema } from "@/lib/validations";

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
  const existing = await getOfficialLetterById(prisma, id);
  if (!existing) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Letter not found." }, { status: 404 });
  }

  let parsedInput: ReturnType<typeof createOfficialLetterSchema.parse> | undefined;
  try {
    const body = await request.json();
    const parsed = createOfficialLetterSchema.safeParse({
      ...body,
      companyId: body.companyId ?? existing.companyId,
    });
    if (parsed.success) parsedInput = parsed.data;
  } catch {
    parsedInput = undefined;
  }

  try {
    const letter = await issueOfficialLetter(prisma, id, session.user.id, parsedInput);
    return NextResponse.json(letter);
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
