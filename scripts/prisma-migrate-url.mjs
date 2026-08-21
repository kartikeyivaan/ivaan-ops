/**
 * Neon pooled endpoints (-pooler / pgbouncer) cannot hold Prisma migrate
 * advisory locks reliably. Always run migrate against a direct URL.
 */

export function isPoolerUrl(url) {
  if (!url) return false;
  try {
    const normalized = url.replace(/^postgres(ql)?:\/\//i, "http://");
    const host = new URL(normalized).hostname.toLowerCase();
    return host.includes("-pooler") || /[?&]pgbouncer=true\b/i.test(url);
  } catch {
    return /[-.]pooler\./i.test(url) || /[?&]pgbouncer=true\b/i.test(url);
  }
}

export function toDirectUrl(url) {
  if (!url) return url;
  return url.replace(/-pooler\./gi, ".");
}

/** Host only — safe to log. */
export function urlHost(url) {
  if (!url) return "(missing)";
  try {
    return new URL(url.replace(/^postgres(ql)?:\/\//i, "http://")).host;
  } catch {
    return "(unparseable)";
  }
}

/**
 * Resolve the connection string Prisma Migrate should use.
 * Prefer DIRECT_URL when it is not pooled; otherwise derive from DATABASE_URL.
 */
export function resolveMigrateDatabaseUrl({
  databaseUrl = process.env.DATABASE_URL,
  directUrl = process.env.DIRECT_URL,
} = {}) {
  const candidates = [directUrl, databaseUrl].filter((v) => typeof v === "string" && v.trim());
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!isPoolerUrl(trimmed)) return trimmed;
  }
  if (databaseUrl?.trim()) return toDirectUrl(databaseUrl.trim());
  if (directUrl?.trim()) return toDirectUrl(directUrl.trim());
  return undefined;
}
