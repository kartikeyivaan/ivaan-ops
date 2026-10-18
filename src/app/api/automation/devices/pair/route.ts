import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRunAutomation } from "@/lib/automation-permissions";
import { createAutomationPairingCode } from "@/lib/automation-device-auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user || !canRunAutomation(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const pairing = await createAutomationPairingCode(prisma, session.user.id);
  return NextResponse.json(pairing);
}
