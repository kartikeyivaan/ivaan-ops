import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { getDocGenGeneration } from "@/lib/doc-gen-generation-service";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const { id } = await context.params;
    const generation = await getDocGenGeneration(prisma, companyId, id);
    if (!generation) return docGenJsonError("Not found.", 404);
    return NextResponse.json(generation);
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to load generation.", 500);
  }
}
