"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { isAllCompaniesScope, resolveDashboardCompanyIds } from "@/lib/company-scope";
import {
  authorizeDashboardRefresh,
  buildDashboardCacheTag,
} from "@/lib/sales-dashboard/dashboard-cache";
import type { DashboardKind } from "@/lib/sales-dashboard/dashboard-types";

export type RefreshDashboardResult =
  | { ok: true }
  | { ok: false; error: string };

export async function refreshDashboardCache(input: {
  kind: DashboardKind;
  viewedUserId?: string;
}): Promise<RefreshDashboardResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You need to sign in again." };
  }

  const authorized = authorizeDashboardRefresh({
    kind: input.kind,
    viewerId: session.user.id,
    viewerRoles: session.user.roles ?? [],
    viewedUserId: input.viewedUserId,
  });

  if (!authorized.ok) {
    return authorized;
  }

  const tag = buildDashboardCacheTag({
    kind: input.kind,
    companyIds: resolveDashboardCompanyIds(session),
    allCompanies: isAllCompaniesScope(session.user.activeCompanyId),
    userKey: authorized.userKey,
  });

  try {
    revalidateTag(tag);
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] refresh failed", error);
    return { ok: false, error: "Could not refresh. Showing last saved numbers." };
  }
}
