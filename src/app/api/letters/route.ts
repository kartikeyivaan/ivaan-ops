import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import {
  createOfficialLetter,
  LetterServiceError,
  listOfficialLetters,
} from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { createOfficialLetterSchema, officialLetterSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { searchParams } = new URL(request.url);
  const parsed = officialLetterSearchSchema.safeParse({
    companyId: searchParams.get("companyId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const result = await listOfficialLetters(prisma, parsed.data);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const body = await request.json();
  const parsed = createOfficialLetterSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid letter data.", 400, parsed.error.flatten());
  }

  try {
    const letter = await createOfficialLetter(prisma, parsed.data, session.user.id);
    return NextResponse.json(letter, { status: 201 });
  } catch (error) {
    if (error instanceof LetterServiceError) {
      return errorResponse(error.code, error.message, error.status);
    }
    throw error;
  }
}
