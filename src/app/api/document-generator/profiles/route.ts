import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { upsertDocGenProfile } from "@/lib/doc-gen-profile-service";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  profileId: z.string().uuid().optional(),
  displayName: z.string().min(1),
  mobileNumber: z.string().nullable().optional(),
  consumerNumber: z.string().nullable().optional(),
  fieldValues: z.record(z.string()).default({}),
  linkedCustomerId: z.string().uuid().nullable().optional(),
  linkedServiceId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid profile payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const profile = await upsertDocGenProfile(prisma, {
      companyId,
      userId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json(profile, { status: parsed.data.profileId ? 200 : 201 });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to save profile.", 500);
  }
}
