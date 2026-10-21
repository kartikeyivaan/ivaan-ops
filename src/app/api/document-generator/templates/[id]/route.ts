import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { deleteDocGenTemplate, getDocGenTemplate } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";
import { DocGenEntityStatus } from "@prisma/client";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(DocGenEntityStatus).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const template = await getDocGenTemplate(prisma, companyId, id);
    if (!template) return docGenJsonError("Not found.", 404);
    return NextResponse.json(template);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load template.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid template payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const existing = await prisma.docGenTemplate.findFirst({ where: { id, companyId } });
    if (!existing) return docGenJsonError("Not found.", 404);
    const template = await prisma.docGenTemplate.update({
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
    return NextResponse.json(template);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to update template.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const template = await deleteDocGenTemplate(prisma, {
      companyId,
      templateId: id,
      userId: session.user.id,
    });
    return NextResponse.json(template);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to delete template.", 500);
  }
}
