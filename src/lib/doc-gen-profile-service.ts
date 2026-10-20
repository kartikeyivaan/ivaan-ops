import type { PrismaClient } from "@prisma/client";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_TABLES,
  writeDocGenAudit,
} from "@/lib/doc-gen-audit";

export type DocGenCustomerSnapshot = {
  displayName: string;
  /** Customer register / code shown on the generate Customer step. */
  registerNumber?: string | null;
  /** @deprecated Prefer data-form fields; kept for older generations. */
  mobileNumber?: string | null;
  /** @deprecated Prefer data-form fields; kept for older generations. */
  consumerNumber?: string | null;
  fieldValues: Record<string, string>;
  source?: {
    type: "profile" | "service" | "customer" | "manual";
    id?: string;
  };
};

export async function searchDocGenProfiles(
  prisma: PrismaClient,
  companyId: string,
  q: string,
  limit = 20,
) {
  const query = q.trim();
  if (!query) return [];

  return prisma.docGenProfile.findMany({
    where: {
      companyId,
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { mobileNumber: { contains: query, mode: "insensitive" } },
        { consumerNumber: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      displayName: true,
      mobileNumber: true,
      consumerNumber: true,
      fieldValuesJson: true,
      linkedCustomerId: true,
      linkedServiceId: true,
    },
  });
}

export async function searchServiceRequestsForDocGen(
  prisma: PrismaClient,
  companyId: string,
  q: string,
  limit = 20,
) {
  const query = q.trim();
  if (!query) return [];

  return prisma.serviceRequest.findMany({
    where: {
      companyId,
      OR: [
        { customerName: { contains: query, mode: "insensitive" } },
        { mobileNumber: { contains: query, mode: "insensitive" } },
        { consumerNumber: { contains: query, mode: "insensitive" } },
        { serviceRequestNumber: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { requestDate: "desc" },
    take: limit,
    select: {
      id: true,
      serviceRequestNumber: true,
      customerName: true,
      mobileNumber: true,
      consumerNumber: true,
      installationAddress: true,
      cityOrVillage: true,
    },
  });
}

export async function searchSalesCustomersForDocGen(prisma: PrismaClient, q: string, limit = 20) {
  const query = q.trim();
  if (!query) return [];

  return prisma.customer.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { customerName: { contains: query, mode: "insensitive" } },
        { mobile: { contains: query, mode: "insensitive" } },
        { customerCode: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { customerName: "asc" },
    take: limit,
    select: {
      id: true,
      customerCode: true,
      customerName: true,
      mobile: true,
      address: true,
      city: true,
    },
  });
}

export async function upsertDocGenProfile(
  prisma: PrismaClient,
  input: {
    companyId: string;
    userId: string;
    profileId?: string;
    displayName: string;
    mobileNumber?: string | null;
    consumerNumber?: string | null;
    fieldValues: Record<string, string>;
    linkedCustomerId?: string | null;
    linkedServiceId?: string | null;
  },
) {
  const data = {
    displayName: input.displayName.trim(),
    mobileNumber: input.mobileNumber?.trim() || null,
    consumerNumber: input.consumerNumber?.trim() || null,
    fieldValuesJson: input.fieldValues,
    linkedCustomerId: input.linkedCustomerId ?? null,
    linkedServiceId: input.linkedServiceId ?? null,
    updatedById: input.userId,
  };

  if (input.profileId) {
    const existing = await prisma.docGenProfile.findFirst({
      where: { id: input.profileId, companyId: input.companyId },
    });
    if (!existing) throw new Error("NOT_FOUND");
    const profile = await prisma.docGenProfile.update({
      where: { id: existing.id },
      data,
    });
    await writeDocGenAudit({
      eventType: DOC_GEN_AUDIT_EVENTS.PROFILE_UPSERTED,
      tableName: DOC_GEN_AUDIT_TABLES.profiles,
      recordId: profile.id,
      action: "UPDATE",
      performedBy: input.userId,
      companyId: input.companyId,
      reference: profile.displayName,
      newValue: {
        displayName: profile.displayName,
        mobileNumber: profile.mobileNumber,
        consumerNumber: profile.consumerNumber,
      },
    });
    return profile;
  }

  const profile = await prisma.docGenProfile.create({
    data: {
      companyId: input.companyId,
      createdById: input.userId,
      ...data,
    },
  });
  await writeDocGenAudit({
    eventType: DOC_GEN_AUDIT_EVENTS.PROFILE_UPSERTED,
    tableName: DOC_GEN_AUDIT_TABLES.profiles,
    recordId: profile.id,
    action: "CREATE",
    performedBy: input.userId,
    companyId: input.companyId,
    reference: profile.displayName,
    newValue: {
      displayName: profile.displayName,
      mobileNumber: profile.mobileNumber,
      consumerNumber: profile.consumerNumber,
    },
  });
  return profile;
}
