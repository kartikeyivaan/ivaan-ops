import { DocumentationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canManageDocumentation } from "@/lib/documentation-permissions";
import { updateDocumentationStatus } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

const schema = z.object({
  status: z.nativeEnum(DocumentationStatus),
  holdReason: z.string().optional(),
  reviewReason: z.string().optional(),
  remarks: z.string().optional(),
  internalNotes: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Invalid status data." }, { status: 400 });
  try {
    return NextResponse.json(await updateDocumentationStatus(prisma, {
      ...parsed.data,
      id: (await params).id,
      companyId: requireActiveCompany(session),
      changedById: session.user.id,
    }));
  } catch (cause) {
    const messages: Record<string, string> = {
      NOT_FOUND: "Documentation record not found.",
      HOLD_REASON_REQUIRED: "Hold reason is required.",
      REVIEW_REASON_REQUIRED: "Review reason is required.",
    };
    if (cause instanceof Error && messages[cause.message]) {
      return NextResponse.json({ message: messages[cause.message] }, { status: cause.message === "NOT_FOUND" ? 404 : 400 });
    }
    throw cause;
  }
}
