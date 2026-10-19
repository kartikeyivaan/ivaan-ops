import { NextResponse } from "next/server";
import { z } from "zod";
import { DocGenEntityStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { getDocGenDocumentSet, getPublishedSetFormSchema } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(DocGenEntityStatus).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const formSchema = new URL(request.url).searchParams.get("formSchema") === "1";
    if (formSchema) {
      const schema = await getPublishedSetFormSchema(prisma, companyId, id);
      return NextResponse.json(schema);
    }
    const set = await getDocGenDocumentSet(prisma, companyId, id);
    if (!set) return docGenJsonError("Not found.", 404);
    return NextResponse.json(set);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load document set.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid document set payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const existing = await prisma.docGenDocumentSet.findFirst({ where: { id, companyId } });
    if (!existing) return docGenJsonError("Not found.", 404);
    const set = await prisma.docGenDocumentSet.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description?.trim() || null }
          : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updatedById: session.user.id,
      },
    });
    return NextResponse.json(set);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to update document set.", 500);
  }
}
