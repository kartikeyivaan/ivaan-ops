import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import {
  createDocGenDocumentSet,
  listDocGenDocumentSets,
  listPublishedDocGenDocumentSets,
} from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const publishedOnly = new URL(request.url).searchParams.get("published") === "1";
    const sets = publishedOnly
      ? await listPublishedDocGenDocumentSets(prisma, companyId)
      : await listDocGenDocumentSets(prisma, companyId);
    return NextResponse.json(sets);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load document sets.", 500);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid document set payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const set = await createDocGenDocumentSet(prisma, {
      companyId,
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to create document set.", 500);
  }
}
