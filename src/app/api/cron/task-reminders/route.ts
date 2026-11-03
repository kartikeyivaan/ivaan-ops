import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processTaskReminders } from "@/lib/task-service";
import { verifyCronRequest } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const result = await processTaskReminders(prisma);
  return NextResponse.json({ ok: true, ...result });
}
