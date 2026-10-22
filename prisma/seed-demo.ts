/**
 * Ivaan Demo company + buyer demo user + fake sales-chain sample data.
 *
 * Idempotent upserts. Safe to re-run:
 *   npm run db:seed:demo
 *
 * Does not touch ISE/PCMV live rows. Customers use DEMO-* codes / fake GSTs.
 * Each demo user gets 5 quotations, 5 PIs, 5 dispatches, 5 documentation records.
 */
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  ReceivedInAccount,
  UserStatus,
} from "@prisma/client";
import {
  DEMO_COMPANY_CODE,
  DEMO_COMPANY_NAME,
  DEMO_USER_EMAIL,
} from "../src/lib/demo-mode";
import {
  DEMO_SAMPLE_CHAIN_COUNT,
  seedDemoUserSampleChain,
} from "../src/lib/demo-sample-chain";
import { ROLES } from "../src/lib/rbac";

export { DEMO_USER_EMAIL };
export const DEMO_USER_PASSWORD = "Demo@Ivaan1";

function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length <= 4) return `****${digits}`;
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export async function seedIvaanDemo(client: PrismaClient) {
  const roleRows = await client.role.findMany({
    where: {
      name: {
        in: [
          ROLES.SALES_MANAGER,
          ROLES.DOCUMENTATION_EXECUTIVE,
          ROLES.WAREHOUSE,
          ROLES.ACCOUNTS,
        ],
      },
    },
  });
  const roleMap = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
  if (!roleMap[ROLES.SALES_MANAGER] || !roleMap[ROLES.DOCUMENTATION_EXECUTIVE]) {
    throw new Error(
      "Required roles missing. Run the main seed (npm run db:seed) before seed-demo.",
    );
  }

  const defaultTerms = [
    "Payment: 100% advance prior to dispatch (sample demo terms).",
    "Taxes: GST as applicable.",
    "This is sample data for Ivaan Demo — not a live company.",
  ].join("\n");

  const demoProfile = {
    name: DEMO_COMPANY_NAME,
    isDemo: true,
    isPractice: false,
    isActive: true,
    address: "Demo Warehouse · Sample Address\n(Not a live operating address)",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 90000 00001",
    email: "demo@ivaansolar.local",
    gstNumber: "27DEMO0000D1Z0",
    tagline: "Demo Company Record — sample data only",
    bankDetails:
      "Bank: Sample Demo Bank\nA/c No: ******0001   IFSC: DEMO0000001\n(Demo only — not a real account)",
    termsAndConditions: defaultTerms,
    defaultSignatoryName: "Demo Signatory",
    defaultSignatoryDesignation: "Partner (Sample)",
    printContentTopOffsetMm: 65,
  };

  const demo = await client.company.upsert({
    where: { code: DEMO_COMPANY_CODE },
    update: demoProfile,
    create: { code: DEMO_COMPANY_CODE, ...demoProfile },
  });

  let warehouse = await client.warehouse.findFirst({
    where: { companyId: demo.id, name: "Demo HO" },
  });
  if (!warehouse) {
    warehouse = await client.warehouse.create({
      data: {
        companyId: demo.id,
        name: "Demo HO",
        code: "DEMO-HO",
      },
    });
  }

  for (let weekday = 0; weekday < 7; weekday++) {
    await client.companyWorkingDay.upsert({
      where: {
        companyId_weekday: { companyId: demo.id, weekday },
      },
      create: {
        companyId: demo.id,
        weekday,
        isWorking: weekday >= 1 && weekday <= 6,
      },
      update: { isWorking: weekday >= 1 && weekday <= 6 },
    });
  }

  const demoBankAccountNumber = "900000000001";
  await client.bankAccount.upsert({
    where: { accountNumber: demoBankAccountNumber },
    update: {
      companyId: demo.id,
      bankName: "Sample Demo Bank",
      accountName: DEMO_COMPANY_NAME,
      accountNumberMasked: maskAccountNumber(demoBankAccountNumber),
      ifscCode: "DEMO0000001",
      receivedInAccount: ReceivedInAccount.SBI,
      isActive: true,
      visibleToSales: true,
    },
    create: {
      companyId: demo.id,
      bankName: "Sample Demo Bank",
      accountName: DEMO_COMPANY_NAME,
      accountNumber: demoBankAccountNumber,
      accountNumberMasked: maskAccountNumber(demoBankAccountNumber),
      ifscCode: "DEMO0000001",
      receivedInAccount: ReceivedInAccount.SBI,
      currency: "INR",
      isActive: true,
      visibleToSales: true,
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 12);
  const seedPasswordMeta = {
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    lockedUntil: null,
    isDemo: true,
  };

  const demoUser = await client.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {
      name: "Ivaan Demo User",
      passwordHash,
      ...seedPasswordMeta,
    },
    create: {
      name: "Ivaan Demo User",
      email: DEMO_USER_EMAIL,
      officialContactNumber: "9000000001",
      passwordHash,
      ...seedPasswordMeta,
    },
  });

  await client.userRole.deleteMany({ where: { userId: demoUser.id } });
  const demoRoleIds = [
    roleMap[ROLES.SALES_MANAGER],
    roleMap[ROLES.DOCUMENTATION_EXECUTIVE],
    roleMap[ROLES.WAREHOUSE],
    roleMap[ROLES.ACCOUNTS],
  ].filter(Boolean);
  await client.userRole.createMany({
    data: demoRoleIds.map((roleId) => ({ userId: demoUser.id, roleId })),
    skipDuplicates: true,
  });

  // Default demo user → DEMO only.
  await client.userCompany.deleteMany({
    where: { userId: demoUser.id, companyId: { not: demo.id } },
  });
  await client.userCompany.upsert({
    where: {
      userId_companyId: { userId: demoUser.id, companyId: demo.id },
    },
    create: { userId: demoUser.id, companyId: demo.id },
    update: {},
  });

  // Never attach staff (non-demo) users to DEMO — keep other demo users intact.
  const staffOnDemo = await client.userCompany.findMany({
    where: {
      companyId: demo.id,
      user: { isDemo: false },
    },
    select: { userId: true },
  });
  if (staffOnDemo.length) {
    await client.userCompany.deleteMany({
      where: {
        companyId: demo.id,
        userId: { in: staffOnDemo.map((row) => row.userId) },
      },
    });
  }

  const masteryConfig = await client.moduleMasteryConfig.findUnique({
    where: { companyId: demo.id },
  });
  if (!masteryConfig) {
    await client.moduleMasteryConfig.create({
      data: { companyId: demo.id },
    });
  }

  const salesTarget = await client.salesModuleTarget.findFirst({
    where: { companyId: demo.id, scope: "COMPANY_DEFAULT" },
  });
  if (!salesTarget) {
    await client.salesModuleTarget.create({
      data: {
        companyId: demo.id,
        scope: "COMPANY_DEFAULT",
        targetModules: 500,
        createdById: demoUser.id,
        updatedById: demoUser.id,
      },
    });
  }

  // Seed 5× chain for every demo user linked to DEMO (including newly created admins).
  const demoUsers = await client.user.findMany({
    where: {
      isDemo: true,
      companies: { some: { companyId: demo.id } },
    },
    select: { id: true, email: true },
  });

  for (const user of demoUsers) {
    try {
      const result = await seedDemoUserSampleChain(client, {
        demoUserId: user.id,
        companyId: demo.id,
        warehouseId: warehouse.id,
      });
      console.log(
        `[seed-demo] ${user.email}: +${result.created} chains, ${result.skipped} already present (${DEMO_SAMPLE_CHAIN_COUNT} QT/PI/DC/docs each)`,
      );
    } catch (error) {
      console.warn(`[seed-demo] Sample chain skipped for ${user.email}:`, error);
    }
  }

  return { demo, demoUser };
}
