import { PrismaClient } from "@prisma/client";
import { seedLearningPractice } from "./seed-learning";

const prisma = new PrismaClient();

async function main() {
  const company = await seedLearningPractice(prisma);
  console.log("Practice company ready:", company.code, company.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
