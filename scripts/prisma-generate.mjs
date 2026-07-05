import { execSync } from "node:child_process";

// Prisma validate/generate only needs syntactically valid URLs, not a live DB.
const placeholder =
  "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = placeholder;
}
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

execSync("npx prisma generate", { stdio: "inherit" });
