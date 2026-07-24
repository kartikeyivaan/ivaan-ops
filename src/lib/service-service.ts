import {
  Prisma,
  ServicePriority,
  ServiceStatus,
  ServiceUpdateType,
  ServiceVisitStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import { ROLES } from "@/lib/rbac";
import {
  SERVICE_ASSIGNABLE_ROLES,
} from "@/lib/service-permissions";
import {
  SERVICE_COMPANY_CODE,
  calculatePendingAmount,
  calculateServiceDelay,
  generateServiceRequestNumber,
  isValidServiceStatusTransition,
  roundMoney,
  statusRequiresNote,
  statusRequiresWaitingReason,
  suggestTargetCompletionDate,
  toDateOnly,
} from "@/lib/service";
import type {
  AddServiceUpdateInput,
  CreateServiceRequestInput,
  ServiceListQuery,
  UpdateServiceRequestInput,
} from "@/lib/service-validations";

const AUDIT_TABLE = "service_requests";

const userSelect = { id: true, name: true, email: true } as const;

export const serviceRequestInclude = {
  workType: { select: { id: true, name: true, defaultTargetDays: true, isActive: true } },
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
  payments: {
    include: { recordedBy: { select: userSelect } },
    orderBy: { createdAt: "desc" as const },
  },
  attachments: {
    include: { uploadedBy: { select: userSelect } },
    orderBy: { createdAt: "desc" as const },
  },
  updates: {
    include: {
      createdBy: { select: userSelect },
      assignedExecutive: { select: userSelect },
      attachments: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.ServiceRequestInclude;

export type ServiceRequestRecord = Prisma.ServiceRequestGetPayload<{
  include: typeof serviceRequestInclude;
}>;

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Company binding — Service is only available for the Ivaan (ISE) company.
// ---------------------------------------------------------------------------

export async function getServiceCompany(
  prisma: PrismaClient | Tx,
): Promise<{ id: string; code: string }> {
  const company = await prisma.company.findUnique({
    where: { code: SERVICE_COMPANY_CODE },
    select: { id: true, code: true },
  });
  if (!company) throw new Error("SERVICE_COMPANY_NOT_FOUND");
  return company;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeServiceRequest(record: ServiceRequestRecord) {
  const delay = calculateServiceDelay({
    targetCompletionDate: record.targetCompletionDate,
    status: record.status,
    closedDate: record.closedDate,
    completionDate: record.completionDate,
  });

  return {
    ...record,
    totalFees: decimalToNumber(record.totalFees),
    amountReceived: decimalToNumber(record.amountReceived),
    pendingAmount: decimalToNumber(record.pendingAmount),
    delayDays: delay.delayDays,
    delayStatus: delay.delayStatus,
    payments: record.payments.map((payment) => ({
      ...payment,
      amount: decimalToNumber(payment.amount),
    })),
  };
}

export type SerializedServiceRequest = ReturnType<typeof serializeServiceRequest>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadRequestForUpdate(
  prisma: PrismaClient | Tx,
  companyId: string,
  id: string,
) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id, companyId },
    include: { workType: true },
  });
  if (!request) throw new Error("NOT_FOUND");
  return request;
}

/** Append an immutable timeline entry (ServiceUpdate) inside a transaction. */
async function addTimelineEntryTx(
  tx: Tx,
  input: {
    serviceRequestId: string;
    updateType: ServiceUpdateType;
    createdByUserId: string;
    note?: string | null;
    oldStatus?: ServiceStatus | null;
    newStatus?: ServiceStatus | null;
    waitingReason?: ServiceRequestRecord["waitingReason"] | null;
    nextActionDate?: Date | null;
    visitDate?: Date | null;
    visitTime?: string | null;
    visitStatus?: ServiceVisitStatus | null;
    visitResult?: string | null;
    contactMode?: AddServiceUpdateInput["contactMode"] | null;
    materialDetails?: string | null;
    furtherWorkRequired?: boolean | null;
    assignedExecutiveId?: string | null;
    oldAssignedToUserId?: string | null;
    attachment?: { fileUrl: string; fileName?: string | null } | null;
  },
) {
  const update = await tx.serviceUpdate.create({
    data: {
      serviceRequestId: input.serviceRequestId,
      updateType: input.updateType,
      note: input.note ?? null,
      oldStatus: input.oldStatus ?? null,
      newStatus: input.newStatus ?? null,
      waitingReason: input.waitingReason ?? null,
      nextActionDate: input.nextActionDate ?? null,
      visitDate: input.visitDate ?? null,
      visitTime: input.visitTime || null,
      visitStatus: input.visitStatus ?? null,
      visitResult: input.visitResult || null,
      contactMode: input.contactMode ?? null,
      materialDetails: input.materialDetails || null,
      furtherWorkRequired: input.furtherWorkRequired ?? null,
      assignedExecutiveId: input.assignedExecutiveId ?? null,
      oldAssignedToUserId: input.oldAssignedToUserId ?? null,
      createdByUserId: input.createdByUserId,
    },
  });

  if (input.attachment?.fileUrl) {
    await tx.serviceAttachment.create({
      data: {
        serviceRequestId: input.serviceRequestId,
        serviceUpdateId: update.id,
        fileUrl: input.attachment.fileUrl,
        fileName: input.attachment.fileName ?? null,
        uploadedByUserId: input.createdByUserId,
      },
    });
  }

  return update;
}

/** Recompute amountReceived + pendingAmount from payments and persist. */
async function recalcServiceTotalsTx(tx: Tx, serviceRequestId: string) {
  const request = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: serviceRequestId },
    select: { totalFees: true },
  });
  const aggregate = await tx.servicePayment.aggregate({
    where: { serviceRequestId },
    _sum: { amount: true },
  });
  const totalFees = decimalToNumber(request.totalFees);
  const amountReceived = roundMoney(decimalToNumber(aggregate._sum.amount ?? 0));
  const pendingAmount = calculatePendingAmount(totalFees, amountReceived);

  await tx.serviceRequest.update({
    where: { id: serviceRequestId },
    data: { amountReceived, pendingAmount },
  });

  return { totalFees, amountReceived, pendingAmount };
}

async function serialized(prisma: PrismaClient | Tx, id: string) {
  const record = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id },
    include: serviceRequestInclude,
  });
  return serializeServiceRequest(record);
}

// ---------------------------------------------------------------------------
// Assignable executives
// ---------------------------------------------------------------------------

export async function listServiceExecutives(prisma: PrismaClient, companyId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: { some: { role: { name: { in: [...SERVICE_ASSIGNABLE_ROLES] } } } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createServiceRequest(
  prisma: PrismaClient,
  input: CreateServiceRequestInput & { companyId: string; createdByUserId: string },
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, code: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  let workTypeDefaultDays: number | null = null;
  if (input.workTypeId) {
    const workType = await prisma.serviceWorkType.findUnique({
      where: { id: input.workTypeId },
      select: { id: true, name: true, isActive: true, defaultTargetDays: true },
    });
    if (!workType) throw new Error("WORK_TYPE_NOT_FOUND");
    workTypeDefaultDays = workType.defaultTargetDays;
    if (workType.name.toLowerCase() === "other" && !input.customWorkType) {
      throw new Error("CUSTOM_WORK_TYPE_REQUIRED");
    }
  } else if (!input.customWorkType) {
    throw new Error("WORK_TYPE_REQUIRED");
  }

  const now = new Date();
  const assigned = input.assignedToUserId ?? null;
  const status = assigned ? ServiceStatus.ASSIGNED : ServiceStatus.OPEN;

  let targetCompletionDate = input.targetCompletionDate
    ? toDateOnly(input.targetCompletionDate)
    : null;
  if (!targetCompletionDate && assigned) {
    targetCompletionDate = suggestTargetCompletionDate(now, workTypeDefaultDays);
  }

  const totalFees = input.totalFees ?? 0;

  const number = await generateServiceRequestNumber(prisma, company.code, company.id, now);

  return prisma.$transaction(async (tx) => {
    const created = await tx.serviceRequest.create({
      data: {
        serviceRequestNumber: number,
        companyId: input.companyId,
        customerName: input.customerName,
        mobileNumber: input.mobileNumber || null,
        alternateMobileNumber: input.alternateMobileNumber || null,
        consumerNumber: input.consumerNumber || null,
        installationAddress: input.installationAddress || null,
        cityOrVillage: input.cityOrVillage || null,
        landmark: input.landmark || null,
        workTypeId: input.workTypeId ?? null,
        customWorkType: input.customWorkType || null,
        customerRequest: input.customerRequest,
        priority: input.priority,
        status,
        assignedToUserId: assigned,
        requestDate: now,
        targetCompletionDate,
        systemStatus: input.systemStatus,
        complaintSource: input.complaintSource ?? null,
        isChargeable: input.isChargeable,
        totalFees,
        pendingAmount: calculatePendingAmount(totalFees, 0),
        internalNote: input.internalNote || null,
        createdByUserId: input.createdByUserId,
      },
    });

    await addTimelineEntryTx(tx, {
      serviceRequestId: created.id,
      updateType: ServiceUpdateType.CREATED,
      createdByUserId: input.createdByUserId,
      newStatus: status,
      note: "Service request created.",
      assignedExecutiveId: assigned,
      attachment: input.attachmentUrl
        ? { fileUrl: input.attachmentUrl, fileName: input.attachmentName || null }
        : null,
    });

    if (assigned) {
      await addTimelineEntryTx(tx, {
        serviceRequestId: created.id,
        updateType: ServiceUpdateType.ASSIGNMENT,
        createdByUserId: input.createdByUserId,
        assignedExecutiveId: assigned,
        note: "Assigned on creation.",
      });
    }

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: created.id,
      action: "CREATE",
      newValue: { serviceRequestNumber: number, status },
      performedBy: input.createdByUserId,
      companyId: input.companyId,
      reference: number,
    });

    return serialized(tx, created.id);
  });
}

// ---------------------------------------------------------------------------
// Read / list
// ---------------------------------------------------------------------------

export async function getServiceRequestById(
  prisma: PrismaClient,
  companyId: string,
  id: string,
) {
  const record = await prisma.serviceRequest.findFirst({
    where: { id, companyId },
    include: serviceRequestInclude,
  });
  if (!record) return null;
  return serializeServiceRequest(record);
}

export async function listServiceRequests(
  prisma: PrismaClient,
  companyId: string,
  filters: ServiceListQuery & { restrictToUserId?: string | null },
) {
  const today = toDateOnly(new Date());
  const activeStatuses: ServiceStatus[] = [
    ServiceStatus.OPEN,
    ServiceStatus.ASSIGNED,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.WAITING,
    ServiceStatus.REOPENED,
  ];

  const and: Prisma.ServiceRequestWhereInput[] = [{ companyId }];

  if (filters.restrictToUserId) {
    and.push({ assignedToUserId: filters.restrictToUserId });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.workTypeId) and.push({ workTypeId: filters.workTypeId });
  if (filters.assignedToUserId) and.push({ assignedToUserId: filters.assignedToUserId });
  if (filters.paymentPending) and.push({ pendingAmount: { gt: 0 } });
  if (filters.dateFrom) and.push({ requestDate: { gte: filters.dateFrom } });
  if (filters.dateTo) and.push({ requestDate: { lte: filters.dateTo } });

  switch (filters.quickFilter) {
    case "my":
      // handled by restrictToUserId at the route level; no-op here
      break;
    case "unassigned":
      and.push({ assignedToUserId: null, status: { in: activeStatuses } });
      break;
    case "open":
      and.push({ status: ServiceStatus.OPEN });
      break;
    case "in_progress":
      and.push({ status: ServiceStatus.IN_PROGRESS });
      break;
    case "waiting":
      and.push({ status: ServiceStatus.WAITING });
      break;
    case "delayed":
      and.push({
        targetCompletionDate: { lt: today },
        status: { in: activeStatuses },
      });
      break;
    case "completed":
      and.push({ status: ServiceStatus.COMPLETED });
      break;
    case "closed":
      and.push({ status: ServiceStatus.CLOSED });
      break;
    default:
      break;
  }

  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { serviceRequestNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { mobileNumber: { contains: q, mode: "insensitive" } },
        { consumerNumber: { contains: q, mode: "insensitive" } },
        { customWorkType: { contains: q, mode: "insensitive" } },
        { customerRequest: { contains: q, mode: "insensitive" } },
        { workType: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const where: Prisma.ServiceRequestWhereInput = { AND: and };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;

  const sortDir = filters.sortDir ?? "desc";
  const orderBy: Prisma.ServiceRequestOrderByWithRelationInput = filters.sortBy
    ? { [filters.sortBy]: sortDir }
    : { updatedAt: "desc" };

  const [total, records] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      include: serviceRequestInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: records.map(serializeServiceRequest),
    total,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

export async function updateServiceRequest(
  prisma: PrismaClient,
  input: UpdateServiceRequestInput & {
    companyId: string;
    id: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);

  if (input.workTypeId) {
    const workType = await prisma.serviceWorkType.findUnique({
      where: { id: input.workTypeId },
      select: { name: true },
    });
    if (!workType) throw new Error("WORK_TYPE_NOT_FOUND");
    if (workType.name.toLowerCase() === "other" && !input.customWorkType) {
      throw new Error("CUSTOM_WORK_TYPE_REQUIRED");
    }
  }

  const data: Prisma.ServiceRequestUpdateInput = {};
  const set = <K extends keyof UpdateServiceRequestInput>(key: K) =>
    input[key] !== undefined;

  if (set("customerName")) data.customerName = input.customerName;
  if (set("mobileNumber")) data.mobileNumber = input.mobileNumber || null;
  if (set("alternateMobileNumber"))
    data.alternateMobileNumber = input.alternateMobileNumber || null;
  if (set("consumerNumber")) data.consumerNumber = input.consumerNumber || null;
  if (set("installationAddress"))
    data.installationAddress = input.installationAddress || null;
  if (set("cityOrVillage")) data.cityOrVillage = input.cityOrVillage || null;
  if (set("landmark")) data.landmark = input.landmark || null;
  if (set("customerRequest")) data.customerRequest = input.customerRequest;
  if (set("priority")) data.priority = input.priority;
  if (set("systemStatus")) data.systemStatus = input.systemStatus;
  if (set("internalNote")) data.internalNote = input.internalNote || null;
  if (set("complaintSource"))
    data.complaintSource = input.complaintSource ?? null;
  if (input.workTypeId !== undefined) {
    data.workType = input.workTypeId
      ? { connect: { id: input.workTypeId } }
      : { disconnect: true };
    data.customWorkType = input.customWorkType || null;
  }
  if (input.targetCompletionDate !== undefined) {
    data.targetCompletionDate = input.targetCompletionDate
      ? toDateOnly(input.targetCompletionDate)
      : null;
  }

  let recalc = false;
  if (set("isChargeable")) data.isChargeable = input.isChargeable;
  if (set("totalFees")) {
    data.totalFees = input.totalFees;
    recalc = true;
  }

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id: existing.id }, data });

    if (recalc) {
      await recalcServiceTotalsTx(tx, existing.id);
    }

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.EDITED,
      createdByUserId: input.performedByUserId,
      note: "Request details edited.",
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      oldValue: {
        customerName: existing.customerName,
        priority: existing.priority,
        totalFees: decimalToNumber(existing.totalFees),
      },
      newValue: data as Prisma.InputJsonValue,
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Assignment (PRD §12)
// ---------------------------------------------------------------------------

export async function assignServiceRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    assignedToUserId: string | null;
    targetCompletionDate?: Date | null;
    note?: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);

  if (input.assignedToUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: input.assignedToUserId,
        status: "ACTIVE",
        companies: { some: { companyId: input.companyId } },
        roles: { some: { role: { name: { in: [...SERVICE_ASSIGNABLE_ROLES] } } } },
      },
      select: { id: true },
    });
    if (!user) throw new Error("INVALID_ASSIGNEE");
  }

  const oldAssignee = existing.assignedToUserId;

  let status = existing.status;
  if (input.assignedToUserId && existing.status === ServiceStatus.OPEN) {
    status = ServiceStatus.ASSIGNED;
  } else if (!input.assignedToUserId && existing.status === ServiceStatus.ASSIGNED) {
    status = ServiceStatus.OPEN;
  }

  let targetCompletionDate = existing.targetCompletionDate;
  if (input.targetCompletionDate !== undefined) {
    targetCompletionDate = input.targetCompletionDate
      ? toDateOnly(input.targetCompletionDate)
      : null;
  } else if (input.assignedToUserId && !existing.targetCompletionDate) {
    targetCompletionDate =
      suggestTargetCompletionDate(new Date(), existing.workType?.defaultTargetDays ?? null) ??
      null;
  }

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: existing.id },
      data: { assignedToUserId: input.assignedToUserId, status, targetCompletionDate },
    });

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.ASSIGNMENT,
      createdByUserId: input.performedByUserId,
      note: input.note ?? (input.assignedToUserId ? "Assigned." : "Unassigned."),
      oldAssignedToUserId: oldAssignee,
      assignedExecutiveId: input.assignedToUserId,
      oldStatus: existing.status !== status ? existing.status : null,
      newStatus: existing.status !== status ? status : null,
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      oldValue: { assignedToUserId: oldAssignee, status: existing.status },
      newValue: { assignedToUserId: input.assignedToUserId, status },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Status change (general engine — Waiting / In Progress / Assigned / Cancelled)
// Completion, Close, and Reopen use their dedicated functions below.
// ---------------------------------------------------------------------------

const DEDICATED_STATUSES: ServiceStatus[] = [
  ServiceStatus.COMPLETED,
  ServiceStatus.CLOSED,
  ServiceStatus.REOPENED,
];

export async function changeServiceStatus(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    status: ServiceStatus;
    note?: string;
    waitingReason?: ServiceRequestRecord["waitingReason"] | null;
    nextActionDate?: Date | null;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);

  if (DEDICATED_STATUSES.includes(input.status)) {
    throw new Error("USE_DEDICATED_ACTION");
  }
  if (input.status === existing.status) throw new Error("NO_STATUS_CHANGE");
  if (!isValidServiceStatusTransition(existing.status, input.status)) {
    throw new Error("INVALID_TRANSITION");
  }
  if (statusRequiresNote(input.status) && !input.note) {
    throw new Error("NOTE_REQUIRED");
  }
  if (statusRequiresWaitingReason(input.status) && !input.waitingReason) {
    throw new Error("WAITING_REASON_REQUIRED");
  }
  if (input.status === ServiceStatus.ASSIGNED && !existing.assignedToUserId) {
    throw new Error("ASSIGNEE_REQUIRED");
  }

  const data: Prisma.ServiceRequestUpdateInput = {
    status: input.status,
    waitingReason:
      input.status === ServiceStatus.WAITING ? input.waitingReason : null,
  };
  if (input.nextActionDate !== undefined) {
    data.nextActionDate = input.nextActionDate ? toDateOnly(input.nextActionDate) : null;
  }
  if (input.status === ServiceStatus.CANCELLED) {
    data.cancellationReason = input.note ?? null;
  }

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id: existing.id }, data });

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.STATUS_CHANGE,
      createdByUserId: input.performedByUserId,
      oldStatus: existing.status,
      newStatus: input.status,
      waitingReason: input.status === ServiceStatus.WAITING ? input.waitingReason : null,
      nextActionDate: input.nextActionDate ?? null,
      note: input.note ?? null,
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: input.status === ServiceStatus.CANCELLED ? "CANCEL" : "UPDATE",
      oldValue: { status: existing.status },
      newValue: { status: input.status },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Add update / visit flow (PRD §16, §17)
// ---------------------------------------------------------------------------

function validateUpdatePayload(input: AddServiceUpdateInput) {
  switch (input.updateType) {
    case ServiceUpdateType.CUSTOMER_CONTACTED:
      if (!input.contactMode) throw new Error("CONTACT_MODE_REQUIRED");
      break;
    case ServiceUpdateType.VISIT_SCHEDULED:
      if (!input.visitDate) throw new Error("VISIT_DATE_REQUIRED");
      if (!input.assignedExecutiveId) throw new Error("VISIT_EXECUTIVE_REQUIRED");
      break;
    case ServiceUpdateType.SITE_VISIT_COMPLETED:
      if (!input.visitResult) throw new Error("VISIT_RESULT_REQUIRED");
      break;
    case ServiceUpdateType.MATERIAL_REQUIRED:
      if (!input.materialDetails) throw new Error("MATERIAL_DETAILS_REQUIRED");
      break;
    default:
      break;
  }
}

export async function addServiceUpdate(
  prisma: PrismaClient,
  input: AddServiceUpdateInput & {
    companyId: string;
    id: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);
  validateUpdatePayload(input);

  const visitStatus =
    input.updateType === ServiceUpdateType.VISIT_SCHEDULED
      ? input.visitStatus ?? ServiceVisitStatus.SCHEDULED
      : input.updateType === ServiceUpdateType.SITE_VISIT_COMPLETED
        ? input.visitStatus ?? ServiceVisitStatus.COMPLETED
        : input.visitStatus ?? null;

  return prisma.$transaction(async (tx) => {
    // A scheduled visit assigns the request if it is still unassigned.
    const requestData: Prisma.ServiceRequestUpdateInput = {};
    if (input.nextActionDate !== undefined && input.nextActionDate !== null) {
      requestData.nextActionDate = toDateOnly(input.nextActionDate);
    }
    if (
      input.updateType === ServiceUpdateType.VISIT_SCHEDULED &&
      input.assignedExecutiveId &&
      !existing.assignedToUserId
    ) {
      requestData.assignedTo = { connect: { id: input.assignedExecutiveId } };
      if (existing.status === ServiceStatus.OPEN) {
        requestData.status = ServiceStatus.ASSIGNED;
      }
    }
    if (Object.keys(requestData).length > 0) {
      await tx.serviceRequest.update({ where: { id: existing.id }, data: requestData });
    }

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: input.updateType,
      createdByUserId: input.performedByUserId,
      note: input.note ?? null,
      nextActionDate: input.nextActionDate ?? null,
      visitDate: input.visitDate ?? null,
      visitTime: input.visitTime || null,
      visitStatus,
      visitResult: input.visitResult || null,
      contactMode: input.contactMode ?? null,
      materialDetails: input.materialDetails || null,
      furtherWorkRequired: input.furtherWorkRequired ?? null,
      assignedExecutiveId: input.assignedExecutiveId ?? null,
      attachment: input.attachmentUrl
        ? { fileUrl: input.attachmentUrl, fileName: input.attachmentName || null }
        : null,
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      newValue: { updateType: input.updateType },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Payments (PRD §19) — append only
// ---------------------------------------------------------------------------

export async function recordServicePayment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    amount: number;
    paymentMode: Prisma.ServicePaymentCreateInput["paymentMode"];
    paymentDate: Date;
    reference?: string | null;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);
  if (input.amount <= 0) throw new Error("INVALID_AMOUNT");

  return prisma.$transaction(async (tx) => {
    await tx.servicePayment.create({
      data: {
        serviceRequestId: existing.id,
        amount: roundMoney(input.amount),
        paymentMode: input.paymentMode,
        paymentDate: toDateOnly(input.paymentDate),
        reference: input.reference || null,
        recordedByUserId: input.performedByUserId,
      },
    });

    // A payment makes the request chargeable.
    if (!existing.isChargeable) {
      await tx.serviceRequest.update({
        where: { id: existing.id },
        data: { isChargeable: true },
      });
    }

    const totals = await recalcServiceTotalsTx(tx, existing.id);

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.PAYMENT_RECORDED,
      createdByUserId: input.performedByUserId,
      note: `Payment of ${roundMoney(input.amount)} recorded. Pending: ${totals.pendingAmount}.`,
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      newValue: {
        payment: roundMoney(input.amount),
        pendingAmount: totals.pendingAmount,
      },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Completion (PRD §18)
// ---------------------------------------------------------------------------

export async function completeServiceWork(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    workCompleted: string;
    completionDate: Date;
    systemStatusAfterWork: Prisma.ServiceRequestUpdateInput["systemStatusAfterWork"];
    customerConfirmation?: Prisma.ServiceRequestUpdateInput["customerConfirmation"];
    furtherWorkRequired: boolean;
    attachmentUrl?: string;
    attachmentName?: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);

  // Further work required: do not complete — move to In Progress instead.
  if (input.furtherWorkRequired) {
    return prisma.$transaction(async (tx) => {
      const nextStatus =
        existing.status === ServiceStatus.WAITING
          ? ServiceStatus.WAITING
          : ServiceStatus.IN_PROGRESS;
      await tx.serviceRequest.update({
        where: { id: existing.id },
        data: { status: nextStatus, furtherWorkRequired: true },
      });
      await addTimelineEntryTx(tx, {
        serviceRequestId: existing.id,
        updateType: ServiceUpdateType.WORK_UPDATE,
        createdByUserId: input.performedByUserId,
        note: `Further work required. ${input.workCompleted}`,
        oldStatus: existing.status !== nextStatus ? existing.status : null,
        newStatus: existing.status !== nextStatus ? nextStatus : null,
        furtherWorkRequired: true,
        attachment: input.attachmentUrl
          ? { fileUrl: input.attachmentUrl, fileName: input.attachmentName || null }
          : null,
      });
      await writeAuditLogTx(tx, {
        tableName: AUDIT_TABLE,
        recordId: existing.id,
        action: "UPDATE",
        newValue: { furtherWorkRequired: true, status: nextStatus },
        performedBy: input.performedByUserId,
        companyId: input.companyId,
        reference: existing.serviceRequestNumber,
      });
      return serialized(tx, existing.id);
    });
  }

  if (!isValidServiceStatusTransition(existing.status, ServiceStatus.COMPLETED)) {
    throw new Error("INVALID_TRANSITION");
  }

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: ServiceStatus.COMPLETED,
        completionDate: toDateOnly(input.completionDate),
        completionNotes: input.workCompleted,
        systemStatusAfterWork: input.systemStatusAfterWork,
        customerConfirmation: input.customerConfirmation ?? null,
        furtherWorkRequired: false,
        waitingReason: null,
      },
    });

    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.COMPLETION,
      createdByUserId: input.performedByUserId,
      oldStatus: existing.status,
      newStatus: ServiceStatus.COMPLETED,
      note: input.workCompleted,
      attachment: input.attachmentUrl
        ? { fileUrl: input.attachmentUrl, fileName: input.attachmentName || null }
        : null,
    });

    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      oldValue: { status: existing.status },
      newValue: { status: ServiceStatus.COMPLETED },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });

    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Close / Reopen / Cancel (PRD §7, §11)
// ---------------------------------------------------------------------------

export async function closeServiceRequest(
  prisma: PrismaClient,
  input: { companyId: string; id: string; note?: string; performedByUserId: string },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);
  if (!isValidServiceStatusTransition(existing.status, ServiceStatus.CLOSED)) {
    throw new Error("INVALID_TRANSITION");
  }

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: existing.id },
      data: { status: ServiceStatus.CLOSED, closedDate: toDateOnly(new Date()) },
    });
    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.STATUS_CHANGE,
      createdByUserId: input.performedByUserId,
      oldStatus: existing.status,
      newStatus: ServiceStatus.CLOSED,
      note: input.note ?? "Request closed.",
    });
    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      oldValue: { status: existing.status },
      newValue: { status: ServiceStatus.CLOSED },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });
    return serialized(tx, existing.id);
  });
}

export async function reopenServiceRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    reason: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);
  if (!isValidServiceStatusTransition(existing.status, ServiceStatus.REOPENED)) {
    throw new Error("INVALID_TRANSITION");
  }
  if (!input.reason) throw new Error("NOTE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: ServiceStatus.REOPENED,
        reopenedReason: input.reason,
        closedDate: null,
      },
    });
    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.STATUS_CHANGE,
      createdByUserId: input.performedByUserId,
      oldStatus: existing.status,
      newStatus: ServiceStatus.REOPENED,
      note: input.reason,
    });
    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "UPDATE",
      oldValue: { status: existing.status },
      newValue: { status: ServiceStatus.REOPENED },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });
    return serialized(tx, existing.id);
  });
}

export async function cancelServiceRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    reason: string;
    performedByUserId: string;
  },
) {
  const existing = await loadRequestForUpdate(prisma, input.companyId, input.id);
  if (!isValidServiceStatusTransition(existing.status, ServiceStatus.CANCELLED)) {
    throw new Error("INVALID_TRANSITION");
  }
  if (!input.reason) throw new Error("NOTE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: existing.id },
      data: { status: ServiceStatus.CANCELLED, cancellationReason: input.reason },
    });
    await addTimelineEntryTx(tx, {
      serviceRequestId: existing.id,
      updateType: ServiceUpdateType.STATUS_CHANGE,
      createdByUserId: input.performedByUserId,
      oldStatus: existing.status,
      newStatus: ServiceStatus.CANCELLED,
      note: input.reason,
    });
    await writeAuditLogTx(tx, {
      tableName: AUDIT_TABLE,
      recordId: existing.id,
      action: "CANCEL",
      oldValue: { status: existing.status },
      newValue: { status: ServiceStatus.CANCELLED },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
      reference: existing.serviceRequestNumber,
    });
    return serialized(tx, existing.id);
  });
}

// ---------------------------------------------------------------------------
// Duplicate detection (PRD §21) — within Service records only
// ---------------------------------------------------------------------------

export async function findDuplicateOpenServiceRequests(
  prisma: PrismaClient,
  companyId: string,
  params: { mobileNumber?: string; consumerNumber?: string },
) {
  const or: Prisma.ServiceRequestWhereInput[] = [];
  if (params.mobileNumber) or.push({ mobileNumber: params.mobileNumber });
  if (params.consumerNumber) or.push({ consumerNumber: params.consumerNumber });
  if (or.length === 0) return [];

  const records = await prisma.serviceRequest.findMany({
    where: {
      companyId,
      OR: or,
      status: {
        notIn: [ServiceStatus.CLOSED, ServiceStatus.CANCELLED],
      },
    },
    select: {
      id: true,
      serviceRequestNumber: true,
      status: true,
      requestDate: true,
      customerName: true,
      mobileNumber: true,
      consumerNumber: true,
      customWorkType: true,
      workType: { select: { name: true } },
    },
    orderBy: { requestDate: "desc" },
    take: 5,
  });

  return records;
}

/** Latest matching request used for the "Use Previous Details" copy action. */
export async function findPreviousServiceCustomer(
  prisma: PrismaClient,
  companyId: string,
  params: { mobileNumber?: string; consumerNumber?: string },
) {
  const or: Prisma.ServiceRequestWhereInput[] = [];
  if (params.mobileNumber) or.push({ mobileNumber: params.mobileNumber });
  if (params.consumerNumber) or.push({ consumerNumber: params.consumerNumber });
  if (or.length === 0) return null;

  const record = await prisma.serviceRequest.findFirst({
    where: { companyId, OR: or },
    orderBy: { requestDate: "desc" },
    select: {
      customerName: true,
      mobileNumber: true,
      alternateMobileNumber: true,
      consumerNumber: true,
      installationAddress: true,
      cityOrVillage: true,
      landmark: true,
    },
  });

  return record;
}

// ---------------------------------------------------------------------------
// Dashboard metrics (PRD §13)
// ---------------------------------------------------------------------------

export async function getServiceDashboardMetrics(
  prisma: PrismaClient,
  companyId: string,
  restrictToUserId?: string | null,
) {
  const today = toDateOnly(new Date());
  const startOfMonth = toDateOnly(new Date(today.getFullYear(), today.getMonth(), 1));
  const activeStatuses: ServiceStatus[] = [
    ServiceStatus.OPEN,
    ServiceStatus.ASSIGNED,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.WAITING,
    ServiceStatus.REOPENED,
  ];

  const scope: Prisma.ServiceRequestWhereInput = restrictToUserId
    ? { companyId, assignedToUserId: restrictToUserId }
    : { companyId };

  const [
    open,
    unassigned,
    inProgress,
    waiting,
    delayed,
    dueToday,
    completedThisMonth,
    pendingAgg,
  ] = await Promise.all([
    prisma.serviceRequest.count({ where: { ...scope, status: ServiceStatus.OPEN } }),
    prisma.serviceRequest.count({
      where: { ...scope, assignedToUserId: null, status: { in: activeStatuses } },
    }),
    prisma.serviceRequest.count({
      where: { ...scope, status: ServiceStatus.IN_PROGRESS },
    }),
    prisma.serviceRequest.count({ where: { ...scope, status: ServiceStatus.WAITING } }),
    prisma.serviceRequest.count({
      where: { ...scope, targetCompletionDate: { lt: today }, status: { in: activeStatuses } },
    }),
    prisma.serviceRequest.count({
      where: { ...scope, targetCompletionDate: today, status: { in: activeStatuses } },
    }),
    prisma.serviceRequest.count({
      where: { ...scope, status: ServiceStatus.COMPLETED, completionDate: { gte: startOfMonth } },
    }),
    prisma.serviceRequest.aggregate({
      where: { ...scope, status: { notIn: [ServiceStatus.CANCELLED] } },
      _sum: { pendingAmount: true },
    }),
  ]);

  return {
    open,
    unassigned,
    inProgress,
    waiting,
    delayed,
    dueToday,
    completedThisMonth,
    pendingServiceAmount: roundMoney(decimalToNumber(pendingAgg._sum.pendingAmount ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Work types (PRD §10, §14)
// ---------------------------------------------------------------------------

export async function listServiceWorkTypes(
  prisma: PrismaClient,
  options: { includeInactive?: boolean } = {},
) {
  return prisma.serviceWorkType.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
}

export async function createServiceWorkType(
  prisma: PrismaClient,
  input: {
    name: string;
    defaultTargetDays?: number | null;
    isActive: boolean;
    performedByUserId: string;
    companyId: string;
  },
) {
  const max = await prisma.serviceWorkType.aggregate({ _max: { displayOrder: true } });
  const displayOrder = (max._max.displayOrder ?? 0) + 1;

  try {
    const created = await prisma.serviceWorkType.create({
      data: {
        name: input.name,
        defaultTargetDays: input.defaultTargetDays ?? null,
        isActive: input.isActive,
        displayOrder,
      },
    });
    await writeAuditLog({
      tableName: "service_work_types",
      recordId: created.id,
      action: "CREATE",
      newValue: { name: created.name },
      performedBy: input.performedByUserId,
      companyId: input.companyId,
    });
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("DUPLICATE_WORK_TYPE");
    }
    throw error;
  }
}

export async function updateServiceWorkType(
  prisma: PrismaClient,
  input: {
    id: string;
    name?: string;
    defaultTargetDays?: number | null;
    isActive?: boolean;
    displayOrder?: number;
    performedByUserId: string;
    companyId: string;
  },
) {
  const data: Prisma.ServiceWorkTypeUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.defaultTargetDays !== undefined)
    data.defaultTargetDays = input.defaultTargetDays;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;

  try {
    const updated = await prisma.serviceWorkType.update({
      where: { id: input.id },
      data,
    });
    await writeAuditLog({
      tableName: "service_work_types",
      recordId: updated.id,
      action: "UPDATE",
      newValue: data as Prisma.InputJsonValue,
      performedBy: input.performedByUserId,
      companyId: input.companyId,
    });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new Error("DUPLICATE_WORK_TYPE");
      if (error.code === "P2025") throw new Error("NOT_FOUND");
    }
    throw error;
  }
}

export async function reorderServiceWorkTypes(
  prisma: PrismaClient,
  orderedIds: string[],
) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.serviceWorkType.update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}

/** Count metrics helpers reused by the global dashboard if needed. */
export async function countOpenServiceRequests(
  prisma: PrismaClient,
  companyId: string,
  restrictToUserId?: string | null,
) {
  return prisma.serviceRequest.count({
    where: {
      companyId,
      status: ServiceStatus.OPEN,
      ...(restrictToUserId ? { assignedToUserId: restrictToUserId } : {}),
    },
  });
}

export { ServicePriority };
