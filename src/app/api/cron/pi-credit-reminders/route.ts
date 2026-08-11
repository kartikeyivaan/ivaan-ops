import { NextResponse } from "next/server";
import { processPiCreditReminders } from "@/lib/pi-credit-service";
import { prisma } from "@/lib/prisma";

/**
 * Daily credit collection reminders (day 3+ after approval) and overdue
 * escalation to Sales Managers. Secure with CRON_SECRET when set.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await processPiCreditReminders(prisma);
  return NextResponse.json({ ok: true, ...result });
}
