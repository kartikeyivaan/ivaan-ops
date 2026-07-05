import { execSync } from "node:child_process";

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

execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit" });
