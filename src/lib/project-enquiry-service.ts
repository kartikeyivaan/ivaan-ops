import { ProjectEnquiryStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { assertProjectsCompany } from "@/lib/company-scope";
import { writeAuditLogTx } from "@/lib/audit";
import { generateEnquiryNumber } from "@/lib/project-enquiries";
import { canAccessProjectEnquiry, canEditProjectEnquiry } from "@/lib/project-enquiry-permissions";
import { toDateOnly } from "@/lib/quotations";

const CLOSED_STATUSES = new Set<ProjectEnquiryStatus>([
  ProjectEnquiryStatus.WON,
  ProjectEnquiryStatus.LOST,
]);

export const projectEnquiryInclude = {
  company: { select: { id: true, name: true, code: true } },
  salesUser: { select: { id: true, name: true, email: true, mobile: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  proposal: { select: { id: true, proposalNo: true, status: true } },
  followups: {
    orderBy: { createdAt: "desc" as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.ProjectEnquiryInclude;

type ProjectEnquiryRecord = Prisma.ProjectEnquiryGetPayload<{
  include: typeof projectEnquiryInclude;
}>;

function serializeEnquiry(enquiry: ProjectEnquiryRecord) {
  return {
    ...enquiry,
    nextFollowupAt: enquiry.nextFollowupAt.toISOString().slice(0, 10),
    lastFollowupAt: enquiry.lastFollowupAt?.toISOString().slice(0, 10) ?? null,
    createdAt: enquiry.createdAt.toISOString(),
    updatedAt: enquiry.updatedAt.toISOString(),
    followups: enquiry.followups.map((entry) => ({
      ...entry,
      followupDate: entry.followupDate.toISOString().slice(0, 10),
      nextFollowupAt: entry.nextFollowupAt.toISOString().slice(0, 10),
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

function getPriority(status: ProjectEnquiryStatus, nextFollowupAt: Date): number {
  if (CLOSED_STATUSES.has(status)) return 3;
  const today = toDateOnly(new Date());
  if (nextFollowupAt < today) return 0;
  if (nextFollowupAt.getTime() === today.getTime()) return 1;
  return 2;
}

function withDisplaySort(enquiries: ProjectEnquiryRecord[]) {
  return [...enquiries].sort((a, b) => {
    const priorityDiff = getPriority(a.status, a.nextFollowupAt) - getPriority(b.status, b.nextFollowupAt);
    if (priorityDiff !== 0) return priorityDiff;
    return a.nextFollowupAt.getTime() - b.nextFollowupAt.getTime();
  });
}

async function loadEnquiryOrThrow(prisma: PrismaClient, companyId: string, enquiryId: string) {
  const enquiry = await prisma.projectEnquiry.findFirst({
    where: { id: enquiryId, companyId },
    include: projectEnquiryInclude,
  });
  if (!enquiry) {
    throw new Error("ENQUIRY_NOT_FOUND");
  }
  return enquiry;
}

export function assertProjectEnquiryAccess(
  userRoles: string[],
  userId: string,
  enquiry: { salesUserId: string },
) {
  if (!canAccessProjectEnquiry(userRoles, userId, enquiry.salesUserId)) {
    throw new Error("FORBIDDEN");
  }
}

export function assertProjectEnquiryEditable(
  userRoles: string[],
  userId: string,
  enquiry: { salesUserId: string; status: ProjectEnquiryStatus },
) {
  assertProjectEnquiryAccess(userRoles, userId, enquiry);
  if (!canEditProjectEnquiry(userRoles, userId, enquiry)) {
    throw new Error("ENQUIRY_NOT_EDITABLE");
  }
}

export async function listProjectEnquiries(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: ProjectEnquiryStatus;
    salesUserId?: string;
    customerMobile?: string;
    fromDate?: string;
    toDate?: string;
  },
) {
  const where: Prisma.ProjectEnquiryWhereInput = {
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
    ...(filters.customerMobile ? { customerMobile: { contains: filters.customerMobile } } : {}),
    ...(filters.fromDate || filters.toDate
      ? {
          nextFollowupAt: {
            ...(filters.fromDate ? { gte: toDateOnly(new Date(filters.fromDate)) } : {}),
            ...(filters.toDate ? { lte: toDateOnly(new Date(filters.toDate)) } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { enquiryNo: { contains: filters.q, mode: "insensitive" } },
            { customerName: { contains: filters.q, mode: "insensitive" } },
            { customerMobile: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const enquiries = await prisma.projectEnquiry.findMany({
    where,
    include: projectEnquiryInclude,
    orderBy: [{ nextFollowupAt: "asc" }, { createdAt: "desc" }],
  });

  return withDisplaySort(enquiries).map(serializeEnquiry);
}

export async function getProjectEnquiryById(
  prisma: PrismaClient,
  companyId: string,
  enquiryId: string,
) {
  const enquiry = await prisma.projectEnquiry.findFirst({
    where: { id: enquiryId, companyId },
    include: projectEnquiryInclude,
  });
  if (!enquiry) return null;
  return serializeEnquiry(enquiry);
}

export async function createProjectEnquiry(
  prisma: PrismaClient,
  input: {
    companyId: string;
    salesUserId: string;
    createdById: string;
    customerName: string;
    customerMobile: string;
    nextFollowupAt: Date;
  },
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, code: true, isPractice: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  assertProjectsCompany(company);

  const enquiryNo = await generateEnquiryNumber(prisma, company.code, input.companyId);

  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.projectEnquiry.create({
      data: {
        enquiryNo,
        companyId: input.companyId,
        salesUserId: input.salesUserId,
        customerName: input.customerName.trim(),
        customerMobile: input.customerMobile.trim(),
        status: ProjectEnquiryStatus.OPEN,
        nextFollowupAt: toDateOnly(input.nextFollowupAt),
        createdById: input.createdById,
        updatedById: input.createdById,
      },
      include: projectEnquiryInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_enquiries",
      recordId: enquiry.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        enquiryNo: enquiry.enquiryNo,
        customerName: enquiry.customerName,
        customerMobile: enquiry.customerMobile,
      },
      reference: enquiry.enquiryNo,
    });

    return serializeEnquiry(enquiry);
  });
}

export async function updateProjectEnquiry(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    userId: string;
    userRoles: string[];
    customerName: string;
    customerMobile: string;
    nextFollowupAt: Date;
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  assertProjectEnquiryEditable(input.userRoles, input.userId, enquiry);

  const updated = await prisma.projectEnquiry.update({
    where: { id: enquiry.id },
    data: {
      customerName: input.customerName.trim(),
      customerMobile: input.customerMobile.trim(),
      nextFollowupAt: toDateOnly(input.nextFollowupAt),
      updatedById: input.userId,
    },
    include: projectEnquiryInclude,
  });

  return serializeEnquiry(updated);
}

export async function addProjectEnquiryFollowup(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    userId: string;
    userRoles: string[];
    note: string;
    outcome?: string;
    followupDate: Date;
    nextFollowupAt: Date;
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  assertProjectEnquiryEditable(input.userRoles, input.userId, enquiry);

  return prisma.$transaction(async (tx) => {
    await tx.projectEnquiryFollowup.create({
      data: {
        enquiryId: enquiry.id,
        note: input.note.trim(),
        outcome: input.outcome?.trim() || null,
        followupDate: toDateOnly(input.followupDate),
        nextFollowupAt: toDateOnly(input.nextFollowupAt),
        createdById: input.userId,
      },
    });

    const updated = await tx.projectEnquiry.update({
      where: { id: enquiry.id },
      data: {
        lastFollowupAt: toDateOnly(input.followupDate),
        nextFollowupAt: toDateOnly(input.nextFollowupAt),
        updatedById: input.userId,
      },
      include: projectEnquiryInclude,
    });

    return serializeEnquiry(updated);
  });
}

export async function markProjectEnquiryWon(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    userId: string;
    userRoles: string[];
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  assertProjectEnquiryAccess(input.userRoles, input.userId, enquiry);
  if (!enquiry.proposalId) {
    throw new Error("PROPOSAL_REQUIRED");
  }
  if (enquiry.status === ProjectEnquiryStatus.WON) {
    throw new Error("ALREADY_WON");
  }
  if (enquiry.status === ProjectEnquiryStatus.LOST) {
    throw new Error("ENQUIRY_CLOSED");
  }

  const updated = await prisma.projectEnquiry.update({
    where: { id: enquiry.id },
    data: {
      status: ProjectEnquiryStatus.WON,
      nextFollowupAt: toDateOnly(new Date()),
      lostReason: null,
      updatedById: input.userId,
    },
    include: projectEnquiryInclude,
  });
  return serializeEnquiry(updated);
}

export async function markProjectEnquiryLost(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    userId: string;
    userRoles: string[];
    lostReason: string;
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  assertProjectEnquiryAccess(input.userRoles, input.userId, enquiry);
  if (enquiry.status === ProjectEnquiryStatus.LOST) {
    throw new Error("ALREADY_LOST");
  }
  if (enquiry.status === ProjectEnquiryStatus.WON) {
    throw new Error("ENQUIRY_CLOSED");
  }

  const updated = await prisma.projectEnquiry.update({
    where: { id: enquiry.id },
    data: {
      status: ProjectEnquiryStatus.LOST,
      nextFollowupAt: toDateOnly(new Date()),
      lostReason: input.lostReason.trim(),
      updatedById: input.userId,
    },
    include: projectEnquiryInclude,
  });
  return serializeEnquiry(updated);
}

export async function reassignProjectEnquiry(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    userId: string;
    salesUserId: string;
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  const updated = await prisma.projectEnquiry.update({
    where: { id: enquiry.id },
    data: {
      salesUserId: input.salesUserId,
      updatedById: input.userId,
    },
    include: projectEnquiryInclude,
  });
  return serializeEnquiry(updated);
}

export async function attachProposalToEnquiry(
  prisma: PrismaClient,
  input: {
    enquiryId: string;
    companyId: string;
    proposalId: string;
    userId: string;
  },
) {
  const enquiry = await loadEnquiryOrThrow(prisma, input.companyId, input.enquiryId);
  if (enquiry.proposalId) {
    throw new Error("ENQUIRY_ALREADY_HAS_PROPOSAL");
  }

  const updated = await prisma.projectEnquiry.update({
    where: { id: enquiry.id },
    data: {
      proposalId: input.proposalId,
      status: ProjectEnquiryStatus.PROPOSAL_SENT,
      lastFollowupAt: toDateOnly(new Date()),
      updatedById: input.userId,
    },
    include: projectEnquiryInclude,
  });
  return serializeEnquiry(updated);
}
