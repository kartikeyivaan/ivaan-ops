import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canAssignDocumentation } from "@/lib/documentation-permissions";
import { assignDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

const schema = z.object({
  toUserId: z.string().uuid().nullable(),
  reason: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canAssignDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Invalid assignment data." }, { status: 400 });
  try {
    return NextResponse.json(await assignDocumentation(prisma, {
      ...parsed.data,
      id: (await params).id,
      companyId: requireActiveCompany(session),
      changedById: session.user.id,
    }));
  } catch (cause) {
    const messages: Record<string, { message: string; status: number }> = {
      NOT_FOUND: { message: "Record not found.", status: 404 },
      ASSIGNEE_NOT_FOUND: { message: "Assignee not found.", status: 404 },
      DISPATCH_CANCELLED: {
        message: "This delivery challan was cancelled. Documentation cannot be assigned.",
        status: 400,
      },
      DISPATCH_NOT_ELIGIBLE: {
        message: "This delivery challan is not eligible for documentation updates.",
        status: 400,
      },
    };
    if (cause instanceof Error && messages[cause.message]) {
      const entry = messages[cause.message];
      return NextResponse.json({ message: entry.message }, { status: entry.status });
    }
    throw cause;
  }
}
