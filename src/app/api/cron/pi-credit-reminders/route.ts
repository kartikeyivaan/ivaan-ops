import { NextResponse } from "next/server";
import { processPiCreditReminders } from "@/lib/pi-credit-service";
import { prisma } from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Daily credit collection reminders (day 3+ after approval) and overdue
 * escalation to Sales Managers. Requires CRON_SECRET; fails closed when unset.
 */
export async function GET(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const result = await processPiCreditReminders(prisma);
  return NextResponse.json({ ok: true, ...result });
}
