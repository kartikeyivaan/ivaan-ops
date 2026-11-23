import { auth } from "@/lib/auth";
import { monthlyAuditErrorFor } from "@/lib/monthly-serial-audit-permissions";

export * from "@/lib/monthly-serial-audit-permissions";

function errorJson(code: string, message: string, status: number, details?: unknown) {
  return Response.json({ code, message, details }, { status });
}

/** Returns the signed-in user id, or a 401/403 response to send back. */
export async function requireMonthlyAuditUser(
  check: (roles: string[]) => boolean,
): Promise<{ userId: string; roles: string[] } | { response: Response }> {
  const session = await auth();
  if (!session?.user) {
    return { response: errorJson("UNAUTHORIZED", "Please sign in.", 401) };
  }
  if (!check(session.user.roles)) {
    return {
      response: errorJson("FORBIDDEN", "You do not have permission for this action.", 403),
    };
  }
  return { userId: session.user.id, roles: session.user.roles };
}

/** Maps a monthly audit service error to a JSON response. */
export function mapMonthlyAuditError(error: unknown, fallback: string) {
  const mapped = monthlyAuditErrorFor(error);
  if (mapped) return errorJson(mapped.code, mapped.message, mapped.status);
  console.error("[monthly-audit] " + fallback, error);
  return errorJson("INTERNAL_ERROR", fallback, 500);
}
