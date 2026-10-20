import { DocGenEntityStatus, DocGenFieldInputType, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { deleteDocGenField, updateDocGenField } from "@/lib/doc-gen-field-service";
import { canAdminDocumentGenerator, canViewDocumentGenerator } from "@/lib/document-generator-permissions";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  inputType: z.nativeEnum(DocGenFieldInputType).optional(),
  configurationJson: z.record(z.unknown()).optional(),
  isRequiredDefault: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
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
    const field = await prisma.docGenField.findFirst({ where: { id, companyId } });
    if (!field) return docGenJsonError("Not found.", 404);
    return NextResponse.json(field);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load field.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return docGenJsonError("Invalid field payload.", 400);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const { configurationJson, ...rest } = parsed.data;
    const field = await updateDocGenField(prisma, {
      companyId,
      fieldId: id,
      userId: session.user.id,
      data: {
        ...rest,
        ...(configurationJson !== undefined
          ? { configurationJson: configurationJson as Prisma.InputJsonValue }
          : {}),
      },
    });
    return NextResponse.json(field);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to update field.", 500);
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
    const field = await deleteDocGenField(prisma, {
      companyId,
      fieldId: id,
      userId: session.user.id,
    });
    return NextResponse.json({ id: field.id, fieldKey: field.fieldKey });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to delete field.", 500);
  }
}
