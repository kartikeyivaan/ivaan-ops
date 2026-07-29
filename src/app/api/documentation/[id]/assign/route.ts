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
    if (cause instanceof Error && ["NOT_FOUND", "ASSIGNEE_NOT_FOUND"].includes(cause.message)) {
      return NextResponse.json({ message: cause.message === "NOT_FOUND" ? "Record not found." : "Assignee not found." }, { status: 404 });
    }
    throw cause;
  }
}
