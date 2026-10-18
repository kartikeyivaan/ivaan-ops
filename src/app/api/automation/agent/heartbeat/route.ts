import { z } from "zod";
import { tryAuthenticateAutomationDevice } from "@/lib/automation-device-auth";
import { automationJsonError } from "@/lib/automation-api";
import { recordAgentHeartbeat } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  agentVersion: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const device = await tryAuthenticateAutomationDevice(prisma, request.headers.get("authorization"));
  if (!device) return automationJsonError("Unauthorized.", 401);

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const heartbeat = await recordAgentHeartbeat(prisma, {
    deviceId: device.deviceId,
    agentVersion: parsed.success ? parsed.data.agentVersion : undefined,
  });
  return Response.json(heartbeat);
}
