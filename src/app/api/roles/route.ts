import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please login to continue." },
      { status: 401 },
    );
  }

  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  if (!isSuperAdmin(session.user.roles)) {
    return NextResponse.json(roles.map((r) => ({ id: r.id, name: r.name })));
  }

  return NextResponse.json(roles);
}
