import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestAgentRelease } from "@/lib/automation-agent-release";
import { canViewAutomation } from "@/lib/automation-permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json(getLatestAgentRelease());
}
