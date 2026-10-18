import { DocGenEntityStatus, DocGenFieldInputType, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { createDocGenField, listDocGenFields } from "@/lib/doc-gen-field-service";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { prisma } from "@/lib/prisma";
import { requireDocGenCompany } from "@/lib/company-scope";

const createSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  inputType: z.nativeEnum(DocGenFieldInputType),
  configurationJson: z.record(z.unknown()).optional(),
  isRequiredDefault: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  status: z.nativeEnum(DocGenEntityStatus).optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const params = new URL(request.url).searchParams;
    const statusValue = params.get("status");
    const status =
      statusValue && Object.values(DocGenEntityStatus).includes(statusValue as DocGenEntityStatus)
        ? (statusValue as DocGenEntityStatus)
        : undefined;
    const fields = await listDocGenFields(prisma, companyId, {
      q: params.get("q") ?? undefined,
      status,
    });
    return NextResponse.json(fields);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load fields.", 500);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return docGenJsonError("Invalid field payload.", 400);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { configurationJson, ...rest } = parsed.data;
    const field = await createDocGenField(prisma, {
      companyId,
      userId: session.user.id,
      data: {
        ...rest,
        ...(configurationJson !== undefined
          ? { configurationJson: configurationJson as Prisma.InputJsonValue }
          : {}),
      },
    });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to create field.", 500);
  }
}
