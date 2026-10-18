import { DocGenLayoutMode, DocGenTemplateEditorType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { createDocGenTemplate, listDocGenTemplates } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  editorType: z.nativeEnum(DocGenTemplateEditorType),
  layoutMode: z.nativeEnum(DocGenLayoutMode).default(DocGenLayoutMode.FIXED_PAGE),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const templates = await listDocGenTemplates(prisma, companyId);
    return NextResponse.json(templates);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load templates.", 500);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return docGenJsonError("Invalid template payload.", 400);
  try {
    const companyId = requireDocGenCompany(session);
    const template = await createDocGenTemplate(prisma, {
      companyId,
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      editorType: parsed.data.editorType,
      layoutMode: parsed.data.layoutMode,
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to create template.", 500);
  }
}
