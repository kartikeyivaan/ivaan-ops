import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPasswordChangeRequirement } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, passwordChangedAt: true },
  });

  if (!user) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "User not found." },
      { status: 404 },
    );
  }

  const requirement = getPasswordChangeRequirement(user);
  return NextResponse.json(requirement);
}
