import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewAutomation } from "@/lib/automation-permissions";
import { getAutomationAgentStatusForUser } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json(await getAutomationAgentStatusForUser(prisma, session.user.id));
}
