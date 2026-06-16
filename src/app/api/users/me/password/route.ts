import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { selfChangePasswordSchema } from "@/lib/validations";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const parsed = selfChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid password data.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "User not found." },
      { status: 404 },
    );
  }

  const currentValid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!currentValid) {
    return NextResponse.json(
      { code: "INVALID_PASSWORD", message: "Current password is incorrect." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Failed to update user password:", error);
    return NextResponse.json(
      {
        code: "SERVER_ERROR",
        message:
          "Password could not be saved. Run database migrations and restart the dev server.",
      },
      { status: 500 },
    );
  }

  try {
    await writeAuditLog({
      tableName: "users",
      recordId: user.id,
      action: "UPDATE",
      performedBy: user.id,
      oldValue: { email: user.email },
      newValue: { email: user.email, passwordChanged: true, selfService: true },
    });
  } catch (error) {
    console.error("Password updated but audit log failed:", error);
  }

  return NextResponse.json({ success: true });
}
