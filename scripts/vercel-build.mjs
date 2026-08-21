import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  isPoolerUrl,
  resolveMigrateDatabaseUrl,
  urlHost,
} from "./prisma-migrate-url.mjs";

const required = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "APP_URL", "AUTH_URL"];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error("\nVercel build failed: missing required environment variables:");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nAdd them in Vercel → Project Settings → Environment Variables (Production, Preview, Development),",
  );
  console.error("or run: powershell -ExecutionPolicy Bypass -File scripts/setup-vercel-env.ps1\n");
  process.exit(1);
}

const migrateUrl = resolveMigrateDatabaseUrl();
if (!migrateUrl) {
  console.error("\nVercel build failed: could not resolve a direct DATABASE_URL for migrations.\n");
  process.exit(1);
}

if (isPoolerUrl(process.env.DIRECT_URL ?? "")) {
  console.warn(
    `WARN: DIRECT_URL points at a Neon pooler (${urlHost(process.env.DIRECT_URL)}). ` +
      `Migrations will use a derived direct host instead (${urlHost(migrateUrl)}). ` +
      "Update DIRECT_URL in Vercel to the non-pooler Neon connection string.",
  );
}

/**
 * Prisma migrate needs a session-capable direct Postgres connection so it can
 * take pg_advisory_lock. Poolers (and brief Neon wake / concurrent deploys)
 * cause P1002 lock timeouts — retry with backoff.
 */
async function migrateDeployWithRetry(maxAttempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `Running prisma migrate deploy (attempt ${attempt}/${maxAttempts}) via ${urlHost(migrateUrl)}`,
      );
      execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: {
          ...process.env,
          // Force both so schema url + directUrl cannot fall back to a pooler.
          DATABASE_URL: migrateUrl,
          DIRECT_URL: migrateUrl,
        },
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const delayMs = attempt * 5000;
      console.warn(
        `migrate deploy failed (often P1002 advisory lock / Neon wake). Retrying in ${delayMs / 1000}s…`,
      );
      await delay(delayMs);
    }
  }
  throw lastError;
}

await migrateDeployWithRetry();
// Always regenerate so cached node_modules cannot ship a stale Prisma Client
// (e.g. missing new enum values like CANCEL_PENDING that already exist in the DB).
execSync("npx prisma generate", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit" });
