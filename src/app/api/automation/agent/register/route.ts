import { NextResponse } from "next/server";
import { z } from "zod";
import { registerAutomationDevice } from "@/lib/automation-device-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  pairingCode: z.string().trim().min(4),
  label: z.string().trim().optional(),
  agentVersion: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid registration payload." }, { status: 400 });
  }

  try {
    const registered = await registerAutomationDevice(prisma, parsed.data);
    return NextResponse.json({
      deviceId: registered.deviceId,
      deviceSecret: registered.deviceSecret,
      authorization: `Bearer ${registered.deviceId}.${registered.deviceSecret}`,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "PAIRING_INVALID") {
      return NextResponse.json({ message: "Pairing code is invalid or expired." }, { status: 400 });
    }
    throw cause;
  }
}
