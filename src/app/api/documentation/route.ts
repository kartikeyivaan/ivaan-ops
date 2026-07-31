import { DocumentationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewDocumentation } from "@/lib/documentation-permissions";
import { listDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const statusValue = params.get("status");
  const status = statusValue && Object.values(DocumentationStatus).includes(statusValue as DocumentationStatus)
    ? statusValue as DocumentationStatus
    : undefined;
  const scopeValue = params.get("scope");
  const scope = scopeValue === "active" || scopeValue === "history" ? scopeValue : undefined;
  return NextResponse.json(await listDocumentation(prisma, requireActiveCompany(session), {
    status,
    scope,
    assignedToId: params.get("assignedToId") ?? undefined,
    q: params.get("q") ?? undefined,
  }));
}
