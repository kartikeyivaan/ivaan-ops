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

export async function notifyBookingApprovalNeeded(
  client: NotificationClient,
  input: {
    companyId: string;
    piNo: string;
    coveringCompanyCodes: string[];
  },
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
  const fromLabel = input.coveringCompanyCodes.join(", ") || "another company";
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Booking approval needed",
      message: `${input.piNo} needs approval to book using stock from ${fromLabel}.`,
      module: "booking",
    })),
  });
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

export async function notifyWarehouseDispatchTodayRecalled(
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
      title: "Dispatch today recalled",
      message: `${input.piNo} is no longer marked for dispatch today.`,
      module: "dispatch",
    })),
  });
}

export async function notifyDispatchTodayApprovalNeeded(
  client: NotificationClient,
  input: {
    companyId: string;
    piNo: string;
    daysUntil?: number;
    needsEarly?: boolean;
    fromCompanyCode?: string | null;
    title?: string;
    message?: string;
  },
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

  const needsEarly = input.needsEarly ?? (input.daysUntil != null && input.daysUntil > 0);
  const fromCompanyCode = input.fromCompanyCode ?? null;
  const title =
    input.title ??
    (needsEarly && fromCompanyCode
      ? "Early dispatch & stock transfer approval needed"
      : needsEarly
        ? "Early dispatch approval needed"
        : fromCompanyCode
          ? "Stock transfer approval needed"
          : "Dispatch today approval needed");
  const message =
    input.message ??
    (needsEarly && fromCompanyCode
      ? `${input.piNo} requires approval for early dispatch (${input.daysUntil ?? 0} day(s) before committed delivery) and stock transfer from ${fromCompanyCode}.`
      : needsEarly
        ? `${input.piNo} requested dispatch today (${input.daysUntil ?? 0} day(s) before committed delivery).`
        : fromCompanyCode
          ? `${input.piNo} needs approval to transfer shortfall stock from ${fromCompanyCode}.`
          : `${input.piNo} requested dispatch today and needs approval.`);

  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title,
      message,
      module: "dispatch",
    })),
  });
}

export async function notifyPiCancelApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string },
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
      title: "PI cancel approval needed",
      message: `${input.piNo} has a cancellation request pending approval.`,
      module: "proforma",
    })),
  });
}

export async function notifyPiCancelled(
  client: NotificationClient,
  input: { salesUserId: string; piNo: string },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: "Proforma invoice cancelled",
      message: `${input.piNo} has been cancelled.`,
      module: "proforma",
    },
    client,
  );
}

export async function notifyPiEditApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string },
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
      title: "PI edit approval needed",
      message: `${input.piNo} has an edit request pending approval.`,
      module: "proforma",
    })),
  });
}

export async function notifyPiEditDecided(
  client: NotificationClient,
  input: { salesUserId: string; piNo: string; approved: boolean; reason?: string },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: input.approved ? "PI edit approved" : "PI edit rejected",
      message: input.approved
        ? `${input.piNo} was updated after edit approval.`
        : `${input.piNo} edit was rejected${input.reason ? `: ${input.reason}` : "."}`,
      module: "proforma",
    },
    client,
  );
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

export async function notifyCrossCompanyTransferApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string; fromCompanyCode: string },
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
      title: "Cross-company transfer approval needed",
      message: `${input.piNo} needs approval to transfer shortfall stock from ${input.fromCompanyCode}.`,
      module: "dispatch",
    })),
  });
}

export async function notifyAccountsStockTransfer(
  client: NotificationClient,
  input: {
    companyId: string;
    transferNumber: string;
    piNo: string;
    dcNo: string;
  },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: { role: { name: { in: [ROLES.ACCOUNTS, ROLES.SUPER_ADMIN] } } },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Stock transfer recorded",
      message: `${input.transferNumber} linked to ${input.piNo} / ${input.dcNo} is ready for accounts review.`,
      module: "accounts",
    })),
  });
}

export async function notifyPiCreditSmApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string; outstanding: number },
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
      title: "PI credit approval needed",
      message: `${input.piNo} needs Sales Manager approval to dispatch on credit (outstanding ₹${Math.round(input.outstanding).toLocaleString("en-IN")}).`,
      module: "credit",
    })),
  });
}

export async function notifyPiCreditAccountsApprovalNeeded(
  client: NotificationClient,
  input: { companyId: string; piNo: string; outstanding: number },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: { role: { name: { in: [ROLES.ACCOUNTS, ROLES.SUPER_ADMIN] } } },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "PI credit accounts approval needed",
      message: `${input.piNo} needs Accounts approval to dispatch on credit (outstanding ₹${Math.round(input.outstanding).toLocaleString("en-IN")}).`,
      module: "credit",
    })),
  });
}

export async function notifyPiCreditApproved(
  client: NotificationClient,
  input: {
    salesUserId: string;
    piNo: string;
    dueDate: string;
    outstanding: number;
  },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: "PI credit approved",
      message: `${input.piNo} credit approved. Clear outstanding ₹${Math.round(input.outstanding).toLocaleString("en-IN")} by ${input.dueDate}.`,
      module: "credit",
    },
    client,
  );
}

export async function notifyPiCreditCleared(
  client: NotificationClient,
  input: { salesUserId: string; piNo: string },
) {
  return createNotification(
    {
      userId: input.salesUserId,
      title: "PI credit cleared",
      message: `Outstanding on ${input.piNo} has been cleared.`,
      module: "credit",
    },
    client,
  );
}

export async function notifyPiCreditReminder(
  client: NotificationClient,
  input: {
    salesUserId: string;
    piNo: string;
    outstanding: number;
    dueDate: string | null;
    overdue: boolean;
  },
) {
  const amount = `₹${Math.round(input.outstanding).toLocaleString("en-IN")}`;
  const duePart = input.dueDate ? ` Due ${input.dueDate}.` : "";
  return createNotification(
    {
      userId: input.salesUserId,
      title: input.overdue ? "PI credit overdue" : "PI credit collection reminder",
      message: input.overdue
        ? `${input.piNo} credit is overdue. Clear outstanding ${amount}.${duePart}`
        : `${input.piNo}: collect outstanding ${amount}.${duePart}`,
      module: "credit",
    },
    client,
  );
}

export async function notifyPiCreditOverdueEscalation(
  client: NotificationClient,
  input: {
    companyId: string;
    piNo: string;
    outstanding: number;
    dueDate: string | null;
    salesExecutiveName?: string;
  },
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
  const amount = `₹${Math.round(input.outstanding).toLocaleString("en-IN")}`;
  const duePart = input.dueDate ? ` (due ${input.dueDate})` : "";
  const sePart = input.salesExecutiveName ? ` SE: ${input.salesExecutiveName}.` : "";
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "PI credit overdue escalation",
      message: `${input.piNo} credit overdue — outstanding ${amount}${duePart}.${sePart}`,
      module: "credit",
    })),
  });
}

export async function notifyRefundApprovalNeeded(
  client: NotificationClient,
  input: {
    companyId: string;
    refundNumber: string;
    customerName: string;
    amount: number;
  },
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
  const amount = `₹${Math.round(input.amount).toLocaleString("en-IN")}`;
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Refund approval needed",
      message: `${input.refundNumber} requests a ${amount} refund to ${input.customerName}.`,
      module: "refunds",
    })),
  });
}

export async function notifyRefundDecided(
  client: NotificationClient,
  input: {
    userId: string;
    refundNumber: string;
    approved: boolean;
    reason?: string;
    returnedForCorrection?: boolean;
  },
) {
  const title = input.returnedForCorrection
    ? "Refund returned for correction"
    : input.approved
      ? "Refund approved"
      : "Refund rejected";
  const message = input.returnedForCorrection
    ? `${input.refundNumber} needs correction${input.reason ? `: ${input.reason}` : "."} Re-submit for approval after updating.`
    : input.approved
      ? `${input.refundNumber} was approved and is now pending execution by Accounts.`
      : `${input.refundNumber} was rejected${input.reason ? `: ${input.reason}` : "."}`;

  return createNotification(
    { userId: input.userId, title, message, module: "refunds" },
    client,
  );
}

export async function notifyRefundExecutionNeeded(
  client: NotificationClient,
  input: { companyId: string; refundNumber: string; amount: number },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: { role: { name: { in: [ROLES.ACCOUNTS, ROLES.SUPER_ADMIN] } } },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };
  const amount = `₹${Math.round(input.amount).toLocaleString("en-IN")}`;
  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Refund pending execution",
      message: `${input.refundNumber} is approved for ${amount} and awaiting transfer.`,
      module: "refunds",
    })),
  });
}

export async function notifyRefundCompleted(
  client: NotificationClient,
  input: {
    userId: string;
    refundNumber: string;
    amount: number;
    utrNumber: string;
  },
) {
  const amount = `₹${Math.round(input.amount).toLocaleString("en-IN")}`;
  return createNotification(
    {
      userId: input.userId,
      title: "Refund completed",
      message: `${input.refundNumber} refunded ${amount}. UTR ${input.utrNumber}.`,
      module: "refunds",
    },
    client,
  );
}

export async function notifyProjectMaterialStockReceived(
  client: NotificationClient,
  input: {
    companyId: string;
    projectNo: string;
    productName: string;
    qty: number;
  },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: {
          role: { name: { in: [ROLES.PROJECTS_MANAGER, ROLES.SUPER_ADMIN] } },
        },
      },
    },
    select: { id: true },
  });
  if (!users.length) return { count: 0 };

  return client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "Project material received",
      message: `${input.qty} × ${input.productName} transferred to Jalgaon Projects for ${input.projectNo}.`,
      module: "project_material",
    })),
  });
}
