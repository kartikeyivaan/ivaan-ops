import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Fail-closed authorization for cron endpoints.
 * Returns an error response when the request must be rejected, or null when
 * the caller presented the correct "Authorization: Bearer <CRON_SECRET>" header.
 */
export function verifyCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`, "utf8");
  const provided = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ code: "UNAUTHORIZED", message: "Unauthorized." }, { status: 401 });
  }

  return null;
}
