import { DocumentationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canManageDocumentation, canViewDocumentation } from "@/lib/documentation-permissions";
import {
  listDocumentation,
  listPendingInvoiceDocumentation,
  markDispatchForDcr,
} from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

const markSchema = z.object({
  handoverId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const companyId = requireActiveCompany(session);
  const params = new URL(request.url).searchParams;
  const scopeValue = params.get("scope");
  if (scopeValue === "pending-invoice") {
    return NextResponse.json(await listPendingInvoiceDocumentation(prisma, companyId));
  }
  const statusValue = params.get("status");
  const status = statusValue && Object.values(DocumentationStatus).includes(statusValue as DocumentationStatus)
    ? statusValue as DocumentationStatus
    : undefined;
  const scope = scopeValue === "active" || scopeValue === "history" ? scopeValue : undefined;
  return NextResponse.json(await listDocumentation(prisma, companyId, {
    status,
    scope,
    assignedToId: params.get("assignedToId") ?? undefined,
    q: params.get("q") ?? undefined,
  }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const parsed = markSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid handover." }, { status: 400 });
  }
  try {
    return NextResponse.json(await markDispatchForDcr(prisma, {
      companyId: requireActiveCompany(session),
      handoverId: parsed.data.handoverId,
      changedById: session.user.id,
    }));
  } catch (cause) {
    const messages: Record<string, { message: string; status: number }> = {
      NOT_FOUND: { message: "Handover not found.", status: 404 },
      ALREADY_EXISTS: { message: "Documentation is already open for this dispatch.", status: 409 },
      DISPATCH_NOT_DISPATCHED: { message: "Only dispatched challans can be sent for DCR.", status: 400 },
      NOT_PENDING_INVOICE: { message: "Invoice is already recorded for this dispatch.", status: 400 },
    };
    if (cause instanceof Error && messages[cause.message]) {
      return NextResponse.json(
        { message: messages[cause.message].message },
        { status: messages[cause.message].status },
      );
    }
    throw cause;
  }
}
