const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const placeholders = ["50200000000001", "00000000000001", "50200000000002"];

async function main() {
  const result = await prisma.bankAccount.updateMany({
    where: { accountNumber: { in: placeholders } },
    data: { isActive: false, visibleToSales: false },
  });
  console.log(`deactivated ${result.count} placeholder account(s)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
