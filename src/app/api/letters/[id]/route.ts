import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import {
  getOfficialLetterById,
  serializeLetterDetail,
  updateOfficialLetterDraft,
  LetterServiceError,
} from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { createOfficialLetterSchema } from "@/lib/validations";

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

  return NextResponse.json(serializeLetterDetail(letter));
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const body = await request.json();
  const parsed = createOfficialLetterSchema.safeParse({
    ...body,
    companyId: body.companyId ?? existing.companyId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Invalid letter data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const letter = await updateOfficialLetterDraft(prisma, id, parsed.data, session.user.id);
    return NextResponse.json(letter);
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
