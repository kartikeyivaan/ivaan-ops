import { z } from "zod";
import { tryAuthenticateAutomationDevice } from "@/lib/automation-device-auth";
import { automationJsonError } from "@/lib/automation-api";
import { completePortalAttempt } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED"]),
  externalDcrNumber: z.string().trim().optional(),
  externalPortalStatus: z.string().trim().optional(),
  errorMessage: z.string().trim().optional(),
  workflowStep: z.string().trim().optional(),
  screenshotUrl: z.string().trim().optional(),
  screenshotFileName: z.string().trim().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const device = await tryAuthenticateAutomationDevice(prisma, request.headers.get("authorization"));
  if (!device) return automationJsonError("Unauthorized.", 401);

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return automationJsonError("Invalid attempt result.", 400);
  }

  try {
    const result = await completePortalAttempt(prisma, {
      attemptId: id,
      deviceId: device.deviceId,
      result: parsed.data,
    });
    return Response.json(result);
  } catch (cause) {
    const messages: Record<string, { message: string; status: number }> = {
      NOT_FOUND: { message: "Attempt not found.", status: 404 },
      DEVICE_MISMATCH: { message: "Device is not assigned to this execution.", status: 403 },
    };
    if (cause instanceof Error && messages[cause.message]) {
      return automationJsonError(messages[cause.message].message, messages[cause.message].status);
    }
    throw cause;
  }
}
