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

  const companies = await prisma.company.findMany({
    where: isSuperAdmin(session.user.roles)
      ? undefined
      : {
          id: { in: session.user.companies.map((c) => c.id) },
        },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(companies);
}
