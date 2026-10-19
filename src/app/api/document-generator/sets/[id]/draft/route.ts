import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  getDraftSetVersion,
  refreshSetSharedFields,
  updateSetDraftItems,
  updateSetFieldConfig,
} from "@/lib/doc-gen-set-service";
import { setFieldConfigSchema } from "@/lib/doc-gen-set-field-config";
import { prisma } from "@/lib/prisma";

const itemsSchema = z.object({
  versionId: z.string().uuid(),
  items: z.array(
    z.object({
      templateVersionId: z.string().uuid(),
      displayName: z.string().min(1),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

const fieldConfigBodySchema = z.object({
  versionId: z.string().uuid(),
  fieldConfig: setFieldConfigSchema,
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    requireDocGenCompany(session);
    const { id } = await context.params;
    const draft = await getDraftSetVersion(prisma, id);
    if (!draft) return docGenJsonError("No editable draft found.", 404);
    return NextResponse.json(draft);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load draft.", 500);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id: documentSetId } = await context.params;
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "items";

    if (action === "refreshFields") {
      const versionId = z.string().uuid().parse(body.versionId);
      const draft = await refreshSetSharedFields(prisma, {
        companyId,
        documentSetId,
        versionId,
        userId: session.user.id,
      });
      return NextResponse.json(draft);
    }

    if (action === "fieldConfig") {
      const parsed = fieldConfigBodySchema.parse(body);
      const draft = await updateSetFieldConfig(prisma, {
        companyId,
        documentSetId,
        versionId: parsed.versionId,
        userId: session.user.id,
        fieldConfig: parsed.fieldConfig,
      });
      return NextResponse.json(draft);
    }

    const parsed = itemsSchema.parse(body);
    const draft = await updateSetDraftItems(prisma, {
      companyId,
      documentSetId,
      versionId: parsed.versionId,
      userId: session.user.id,
      items: parsed.items,
    });
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return docGenJsonError("Invalid draft payload.", 400);
    }
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to save draft.", 500);
  }
}
