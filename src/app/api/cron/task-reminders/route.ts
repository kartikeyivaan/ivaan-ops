import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processTaskReminders } from "@/lib/task-service";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await processTaskReminders(prisma);
  return NextResponse.json({ ok: true, ...result });
}
