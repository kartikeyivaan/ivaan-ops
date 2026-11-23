// Starts the dev server against the Neon TEST COPY only (reads .env.test, never .env).
const fs = require("fs");
const { spawn } = require("child_process");

for (const line of fs.readFileSync(".env.test", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="(.*)"$/);
  if (m) process.env[m[1]] = m[2];
}
if (!String(process.env.DATABASE_URL).includes("ep-wispy-rice")) {
  console.error("Refusing to start: DATABASE_URL is not the test copy.");
  process.exit(1);
}
spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", "3000"], {
  stdio: "inherit",
  env: process.env,
});
