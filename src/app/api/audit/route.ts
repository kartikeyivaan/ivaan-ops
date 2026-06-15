import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get("tableName") ?? undefined;
  const recordId = searchParams.get("recordId") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(tableName ? { tableName } : {}),
      ...(recordId ? { recordId } : {}),
    },
    include: {
      performer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { performedAt: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}
