import { NextResponse } from "next/server";
import { assertCompanyAccess } from "@/lib/customer-permissions";

export function automationJsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function assertCompanyIdsAccess(
  companyIds: string[],
  sessionCompanyIds: string[],
  roles: string[],
): void {
  for (const id of companyIds) {
    if (!assertCompanyAccess(roles, sessionCompanyIds, id)) {
      throw new Error("FORBIDDEN_COMPANY");
    }
  }
}

export function assertAutomationCompanyIds(
  companyIds: string[],
  sessionCompanyIds: string[],
  roles: string[],
): string[] {
  assertCompanyIdsAccess(companyIds, sessionCompanyIds, roles);
  return companyIds;
}

export function parseAutomationCompanyIds(
  raw: string | undefined,
  sessionCompanyIds: string[],
  roles: string[],
): string[] {
  const ids = raw?.trim()
    ? raw.split(",").map((id) => id.trim()).filter(Boolean)
    : sessionCompanyIds;
  assertCompanyIdsAccess(ids, sessionCompanyIds, roles);
  return ids;
}
