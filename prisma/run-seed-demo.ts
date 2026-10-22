/**
 * Standalone re-seed for Ivaan Demo (idempotent).
 * Usage: npm run db:seed:demo
 */
import { PrismaClient } from "@prisma/client";
import {
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
  seedIvaanDemo,
} from "./seed-demo";

const prisma = new PrismaClient();

async function main() {
  const { demo, demoUser } = await seedIvaanDemo(prisma);
  console.log("Ivaan Demo seed completed.");
  console.log(`Company: ${demo.name} (${demo.code}) id=${demo.id}`);
  console.log(`Demo login: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log(`Demo user id=${demoUser.id} (isDemo=true, no Super Admin)`);
  console.log("Re-run anytime with: npm run db:seed:demo");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
