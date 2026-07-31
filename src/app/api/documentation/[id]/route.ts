import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewDocumentation } from "@/lib/documentation-permissions";
import { getDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const row = await getDocumentation(prisma, requireActiveCompany(session), (await params).id);
  return row
    ? NextResponse.json(row)
    : NextResponse.json({ message: "Documentation record not found." }, { status: 404 });
}
