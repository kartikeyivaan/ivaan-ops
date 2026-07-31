import { type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";

type NotificationClient = PrismaClient | Prisma.TransactionClient;

export type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  module?: string;
};

export function createNotification(
  input: CreateNotificationInput,
  client: NotificationClient = prisma,
) {
  return client.notification.create({ data: input });
}

export async function notifyBookingCreated(
  client: NotificationClient,
  input: { salesUserId: string; piNo: string },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: "Booking confirmed",
      message: `${input.piNo} has been booked and inventory reserved.`,
      module: "booking",
    },
    client,
  );
}

export async function notifyDispatchCompleted(
  client: NotificationClient,
  input: { salesUserId: string; dcNo: string },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: "Dispatch completed",
      message: `${input.dcNo} has been dispatched.`,
      module: "dispatch",
    },
    client,
  );
}

export async function notifyWarehouseDispatchToday(
  client: NotificationClient,
  input: { companyId: string; piNo: string },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: { role: { name: { in: [ROLES.WAREHOUSE, ROLES.SUPER_ADMIN] } } },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Dispatch today",
      message: `${input.piNo} is marked for dispatch today.`,
      module: "dispatch",
    })),
  });
}

export async function notifyDispatchTodayApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string; daysUntil: number },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: {
          role: { name: { in: [ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN] } },
        },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Early dispatch approval needed",
      message: `${input.piNo} requested dispatch today (${input.daysUntil} day(s) before committed delivery).`,
      module: "dispatch",
    })),
  });
}

export async function notifyInvoicePending(
  client: NotificationClient,
  input: { companyId: string; dcNo: string },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: { some: { role: { name: { in: [ROLES.ACCOUNTS, ROLES.SUPER_ADMIN] } } } },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Invoice entry pending",
      message: `Invoice details are required for ${input.dcNo}.`,
      module: "accounts",
    })),
  });
}

export async function notifyDocumentationAssigned(
  client: NotificationClient,
  input: { userId: string; dcNo: string },
) {
  return createNotification(
    {
      userId: input.userId,
      title: "Documentation assigned",
      message: `Documentation for ${input.dcNo} has been assigned to you.`,
      module: "documentation",
    },
    client,
  );
}

export async function notifyDocumentationStatusChanged(
  client: NotificationClient,
  input: { userId: string; dcNo: string; status: string },
) {
  return createNotification(
    {
      userId: input.userId,
      title: "Documentation status updated",
      message: `${input.dcNo} is now ${input.status.replaceAll("_", " ").toLowerCase()}.`,
      module: "documentation",
    },
    client,
  );
}
