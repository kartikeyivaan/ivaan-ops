import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { listPublishedTemplateVersions } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const versions = await listPublishedTemplateVersions(prisma, companyId);
    return NextResponse.json(versions);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load template versions.", 500);
  }
}
