/**
 * Create or reset a Super Admin user.
 * Usage: node scripts/create-super-admin.cjs
 */
const bcrypt = require("bcryptjs");
const { PrismaClient, UserStatus } = require("@prisma/client");

const EMAIL = "kartikey.ivaan@gmail.com";
const PASSWORD = "Kartik@123";
const NAME = "Kartikey";

const prisma = new PrismaClient();

async function main() {
  const ise = await prisma.company.findUnique({ where: { code: "ISE" } });
  const pcmv = await prisma.company.findUnique({ where: { code: "PCMV" } });
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "Super Admin" },
  });

  if (!ise || !pcmv || !superAdminRole) {
    throw new Error("Run npm run db:migrate && npm run db:seed first.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: NAME,
      passwordHash,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      passwordChangedAt: now,
    },
    create: {
      name: NAME,
      email: EMAIL,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      passwordChangedAt: now,
    },
  });

  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: superAdminRole.id },
  });

  for (const companyId of [ise.id, pcmv.id]) {
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: user.id, companyId } },
      create: { userId: user.id, companyId },
      update: {},
    });
  }

  const ok = await bcrypt.compare(PASSWORD, passwordHash);
  console.log(`Super Admin ready: ${EMAIL}`);
  console.log(`Password verified: ${ok}`);
  console.log("Restart npm run dev if login still fails (stale server cache).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
