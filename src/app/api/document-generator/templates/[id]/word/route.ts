import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { attachWordDocxToDraft } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id: templateId } = await context.params;
    const form = await request.formData();
    const versionId = form.get("versionId");
    const file = form.get("file");
    if (typeof versionId !== "string") return docGenJsonError("versionId is required.", 400);
    if (!(file instanceof File)) return docGenJsonError("Word (.docx) file is required.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await attachWordDocxToDraft(prisma, {
      companyId,
      templateId,
      versionId,
      fileName: file.name || "template.docx",
      docxBytes: bytes,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to upload Word template.", 500);
  }
}
