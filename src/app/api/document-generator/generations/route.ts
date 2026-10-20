import { DocGenGenerationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import type { DocGenCustomerSnapshot } from "@/lib/doc-gen-profile-service";
import { upsertDocGenProfile } from "@/lib/doc-gen-profile-service";
import {
  listDocGenGenerations,
  runDocGenGeneration,
} from "@/lib/doc-gen-generation-service";
import { prisma } from "@/lib/prisma";

const customerSchema = z.object({
  displayName: z.string().min(1),
  registerNumber: z.string().nullable().optional(),
  mobileNumber: z.string().nullable().optional(),
  consumerNumber: z.string().nullable().optional(),
  source: z
    .object({
      type: z.enum(["profile", "service", "customer", "manual"]),
      id: z.string().optional(),
    })
    .optional(),
});

const bodySchema = z.object({
  documentSetId: z.string().uuid(),
  fieldValues: z.record(z.string()).default({}),
  customer: customerSchema,
  saveToProfile: z.boolean().optional(),
  profileId: z.string().uuid().nullable().optional(),
  linkedCustomerId: z.string().uuid().nullable().optional(),
  linkedServiceId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const params = new URL(request.url).searchParams;
    const statusParam = params.get("status");
    const status =
      statusParam &&
      Object.values(DocGenGenerationStatus).includes(statusParam as DocGenGenerationStatus)
        ? (statusParam as DocGenGenerationStatus)
        : undefined;

    const documentSetIdRaw = params.get("documentSetId");
    const documentSetId =
      documentSetIdRaw && z.string().uuid().safeParse(documentSetIdRaw).success
        ? documentSetIdRaw
        : undefined;

    const result = await listDocGenGenerations(prisma, companyId, {
      q: params.get("q") ?? undefined,
      status,
      documentSetId,
      fromDate: params.get("fromDate") ?? undefined,
      toDate: params.get("toDate") ?? undefined,
      page: Number(params.get("page") ?? "1") || 1,
      pageSize: Number(params.get("pageSize") ?? "25") || 25,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load generation history.", 500);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid generation payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const snapshot: DocGenCustomerSnapshot = {
      displayName: parsed.data.customer.displayName,
      registerNumber: parsed.data.customer.registerNumber,
      mobileNumber: parsed.data.customer.mobileNumber,
      consumerNumber: parsed.data.customer.consumerNumber,
      fieldValues: parsed.data.fieldValues,
      source: parsed.data.customer.source,
    };

    let profileId = parsed.data.profileId ?? null;
    if (parsed.data.saveToProfile) {
      const profile = await upsertDocGenProfile(prisma, {
        companyId,
        userId: session.user.id,
        profileId: profileId ?? undefined,
        displayName: snapshot.displayName,
        mobileNumber: snapshot.mobileNumber,
        consumerNumber: snapshot.consumerNumber,
        fieldValues: parsed.data.fieldValues,
        linkedCustomerId: parsed.data.linkedCustomerId,
        linkedServiceId: parsed.data.linkedServiceId,
      });
      profileId = profile.id;
    }

    const generation = await runDocGenGeneration(prisma, {
      companyId,
      userId: session.user.id,
      documentSetId: parsed.data.documentSetId,
      fieldValues: parsed.data.fieldValues,
      customerSnapshot: snapshot,
      profileId,
    });

    return NextResponse.json(generation, { status: 201 });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to generate documents.", 500);
  }
}
