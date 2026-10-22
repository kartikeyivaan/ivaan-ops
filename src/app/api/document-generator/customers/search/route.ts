import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireDocGenCompany } from "@/lib/company-scope";
import { docGenJsonError, mapDocGenRouteError } from "@/lib/doc-gen-api";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import {
  searchDocGenProfiles,
  searchSalesCustomersForDocGen,
  searchServiceRequestsForDocGen,
} from "@/lib/doc-gen-profile-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    return docGenJsonError("Forbidden.", 403);
  }
  try {
    const companyId = requireDocGenCompany(session);
    const params = new URL(request.url).searchParams;
    const q = params.get("q") ?? "";
    const source = params.get("source") ?? "all";

    const [profiles, services, customers] = await Promise.all([
      source === "all" || source === "profile"
        ? searchDocGenProfiles(prisma, companyId, q)
        : Promise.resolve([]),
      source === "all" || source === "service"
        ? searchServiceRequestsForDocGen(prisma, companyId, q)
        : Promise.resolve([]),
      source === "all" || source === "customer"
        ? searchSalesCustomersForDocGen(prisma, q, 20, companyId)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ profiles, services, customers });
  } catch (error) {
    return mapDocGenRouteError(error) ?? docGenJsonError("Unable to search customers.", 500);
  }
}
