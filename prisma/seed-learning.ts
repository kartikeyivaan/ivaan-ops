import { CustomerType, UserStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  PRACTICE_COMPANY_CODE,
  PRACTICE_COMPANY_NAME,
} from "../src/lib/learning/lessons";

export async function seedLearningPractice(prisma: PrismaClient) {
  const practice = await prisma.company.upsert({
    where: { code: PRACTICE_COMPANY_CODE },
    update: {
      name: PRACTICE_COMPANY_NAME,
      isPractice: true,
      tagline: "Sandbox for Learning Mode — not for live ops",
      city: "Jalgaon",
      state: "Maharashtra",
      isActive: true,
    },
    create: {
      code: PRACTICE_COMPANY_CODE,
      name: PRACTICE_COMPANY_NAME,
      isPractice: true,
      tagline: "Sandbox for Learning Mode — not for live ops",
      city: "Jalgaon",
      state: "Maharashtra",
      address: "Practice sandbox — IvaanOps Learning Mode",
    },
  });

  const existingWh = await prisma.warehouse.findFirst({
    where: { companyId: practice.id, name: "Practice HO" },
  });
  if (!existingWh) {
    await prisma.warehouse.create({
      data: {
        companyId: practice.id,
        name: "Practice HO",
        code: "LEARN-HO",
      },
    });
  }

  // Ensure all active users can enter Learning Mode without a separate grant step.
  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    select: { id: true },
  });
  for (const user of users) {
    await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: practice.id,
        },
      },
      create: { userId: user.id, companyId: practice.id },
      update: {},
    });
  }

  // Sample customer for quotation practice (global customer master).
  const admin = await prisma.user.findFirst({
    where: { email: "admin@ivaansolar.com" },
    select: { id: true },
  });
  const sales = await prisma.user.findFirst({
    where: { email: "sales@ivaansolar.com" },
    select: { id: true },
  });
  const ownerId = sales?.id ?? admin?.id;
  if (ownerId) {
    const gst = "27AAAAA0000A1Z5";
    const existing = await prisma.customer.findUnique({
      where: { gstNumber: gst },
    });
    if (!existing) {
      await prisma.customer.create({
        data: {
          customerCode: "LEARN-CUST-001",
          customerName: "Practice Customer (Learning)",
          contactPersonName: "Learn User",
          customerType: CustomerType.DEALER,
          gstNumber: gst,
          address: "Practice address",
          city: "Jalgaon",
          state: "Maharashtra",
          pinCode: "425001",
          mobile: "9999990001",
          email: "practice.customer@ivaansolar.local",
          assignedSalesUserId: ownerId,
          createdById: ownerId,
          updatedById: ownerId,
        },
      });
    }
  }

  return practice;
}
