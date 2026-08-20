import {
  SalesModuleTargetScope,
  type PrismaClient,
  type SalesModuleTarget,
} from "@prisma/client";
import { getBusinessMonthRange, getBusinessToday } from "@/lib/business-dates";
import { buildDispatchedUnitTotals } from "@/lib/report-builders";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

export const DEFAULT_MODULE_TARGET = 3000;

export type ResolvedModuleTarget = {
  targetModules: number;
  source: SalesModuleTargetScope | "HARD_DEFAULT";
  year: number;
  month: number;
  row: SalesModuleTarget | null;
};

export type ModuleTargetProgressDto = {
  year: number;
  month: number;
  targetModules: number;
  achievedModules: number;
  remainingModules: number;
  progressPercent: number;
  source: ResolvedModuleTarget["source"];
};

export type SalesTargetAdminRow = {
  id: string | null;
  scope: SalesModuleTargetScope;
  executiveId: string | null;
  executiveName: string | null;
  year: number | null;
  month: number | null;
  targetModules: number;
};

export function canManageSalesTargets(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles) || hasRole(userRoles, [ROLES.SALES_MANAGER]);
}

export function canViewSalesTargets(userRoles: string[]): boolean {
  return (
    canManageSalesTargets(userRoles) ||
    hasRole(userRoles, [ROLES.SALES_EXECUTIVE])
  );
}

export async function resolveModuleTarget(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  year: number,
  month: number,
): Promise<ResolvedModuleTarget> {
  const [monthly, executiveDefault, companyDefault] = await Promise.all([
    prisma.salesModuleTarget.findFirst({
      where: {
        companyId,
        scope: SalesModuleTargetScope.MONTHLY_OVERRIDE,
        executiveId,
        year,
        month,
      },
    }),
    prisma.salesModuleTarget.findFirst({
      where: {
        companyId,
        scope: SalesModuleTargetScope.EXECUTIVE_DEFAULT,
        executiveId,
      },
    }),
    prisma.salesModuleTarget.findFirst({
      where: {
        companyId,
        scope: SalesModuleTargetScope.COMPANY_DEFAULT,
      },
    }),
  ]);

  if (monthly) {
    return {
      targetModules: monthly.targetModules,
      source: SalesModuleTargetScope.MONTHLY_OVERRIDE,
      year,
      month,
      row: monthly,
    };
  }
  if (executiveDefault) {
    return {
      targetModules: executiveDefault.targetModules,
      source: SalesModuleTargetScope.EXECUTIVE_DEFAULT,
      year,
      month,
      row: executiveDefault,
    };
  }
  if (companyDefault) {
    return {
      targetModules: companyDefault.targetModules,
      source: SalesModuleTargetScope.COMPANY_DEFAULT,
      year,
      month,
      row: companyDefault,
    };
  }

  return {
    targetModules: DEFAULT_MODULE_TARGET,
    source: "HARD_DEFAULT",
    year,
    month,
    row: null,
  };
}

export async function getModuleTargetProgress(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  asOf = new Date(),
): Promise<ModuleTargetProgressDto> {
  const { fromDate, toDate, year, month } = getBusinessMonthRange(asOf);
  const [resolved, units] = await Promise.all([
    resolveModuleTarget(prisma, companyId, executiveId, year, month),
    buildDispatchedUnitTotals(prisma, {
      companyId,
      salesUserId: executiveId,
      fromDate,
      toDate,
    }),
  ]);

  const achievedModules = units.modules;
  const remainingModules = Math.max(0, resolved.targetModules - achievedModules);
  const progressPercent =
    resolved.targetModules > 0
      ? Math.round((achievedModules / resolved.targetModules) * 1000) / 10
      : 0;

  return {
    year,
    month,
    targetModules: resolved.targetModules,
    achievedModules,
    remainingModules,
    progressPercent,
    source: resolved.source,
  };
}

export async function ensureCompanyDefaultTarget(
  prisma: PrismaClient,
  companyId: string,
  actorUserId: string,
  targetModules = DEFAULT_MODULE_TARGET,
): Promise<SalesModuleTarget> {
  const existing = await prisma.salesModuleTarget.findFirst({
    where: { companyId, scope: SalesModuleTargetScope.COMPANY_DEFAULT },
  });
  if (existing) return existing;

  return prisma.salesModuleTarget.create({
    data: {
      companyId,
      scope: SalesModuleTargetScope.COMPANY_DEFAULT,
      targetModules,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
}

export async function upsertCompanyDefaultTarget(
  prisma: PrismaClient,
  companyId: string,
  targetModules: number,
  actorUserId: string,
): Promise<SalesModuleTarget> {
  assertPositiveTarget(targetModules);
  const existing = await prisma.salesModuleTarget.findFirst({
    where: { companyId, scope: SalesModuleTargetScope.COMPANY_DEFAULT },
  });
  if (existing) {
    return prisma.salesModuleTarget.update({
      where: { id: existing.id },
      data: { targetModules, updatedById: actorUserId },
    });
  }
  return prisma.salesModuleTarget.create({
    data: {
      companyId,
      scope: SalesModuleTargetScope.COMPANY_DEFAULT,
      targetModules,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
}

export async function upsertExecutiveDefaultTarget(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  targetModules: number,
  actorUserId: string,
): Promise<SalesModuleTarget> {
  assertPositiveTarget(targetModules);
  await assertExecutiveInCompany(prisma, companyId, executiveId);

  const existing = await prisma.salesModuleTarget.findFirst({
    where: {
      companyId,
      scope: SalesModuleTargetScope.EXECUTIVE_DEFAULT,
      executiveId,
    },
  });
  if (existing) {
    return prisma.salesModuleTarget.update({
      where: { id: existing.id },
      data: { targetModules, updatedById: actorUserId },
    });
  }
  return prisma.salesModuleTarget.create({
    data: {
      companyId,
      scope: SalesModuleTargetScope.EXECUTIVE_DEFAULT,
      executiveId,
      targetModules,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
}

export async function upsertMonthlyOverrideTarget(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  year: number,
  month: number,
  targetModules: number,
  actorUserId: string,
): Promise<SalesModuleTarget> {
  assertPositiveTarget(targetModules);
  assertYearMonth(year, month);
  await assertExecutiveInCompany(prisma, companyId, executiveId);

  const existing = await prisma.salesModuleTarget.findFirst({
    where: {
      companyId,
      scope: SalesModuleTargetScope.MONTHLY_OVERRIDE,
      executiveId,
      year,
      month,
    },
  });
  if (existing) {
    return prisma.salesModuleTarget.update({
      where: { id: existing.id },
      data: { targetModules, updatedById: actorUserId },
    });
  }
  return prisma.salesModuleTarget.create({
    data: {
      companyId,
      scope: SalesModuleTargetScope.MONTHLY_OVERRIDE,
      executiveId,
      year,
      month,
      targetModules,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
}

export async function deleteSalesModuleTarget(
  prisma: PrismaClient,
  companyId: string,
  targetId: string,
): Promise<void> {
  const row = await prisma.salesModuleTarget.findFirst({
    where: { id: targetId, companyId },
  });
  if (!row) {
    throw new SalesTargetError("Target not found.", "NOT_FOUND");
  }
  if (row.scope === SalesModuleTargetScope.COMPANY_DEFAULT) {
    throw new SalesTargetError(
      "Company default cannot be deleted. Update its value instead.",
      "VALIDATION_ERROR",
    );
  }
  await prisma.salesModuleTarget.delete({ where: { id: targetId } });
}

export async function listSalesTargetsForAdmin(
  prisma: PrismaClient,
  companyId: string,
  actorUserId: string,
): Promise<{
  companyDefault: SalesTargetAdminRow;
  executiveDefaults: SalesTargetAdminRow[];
  monthlyOverrides: SalesTargetAdminRow[];
}> {
  await ensureCompanyDefaultTarget(prisma, companyId, actorUserId);

  const rows = await prisma.salesModuleTarget.findMany({
    where: { companyId },
    include: {
      executive: { select: { id: true, name: true } },
    },
    orderBy: [{ scope: "asc" }, { year: "desc" }, { month: "desc" }],
  });

  const companyDefaultRow = rows.find(
    (row) => row.scope === SalesModuleTargetScope.COMPANY_DEFAULT,
  )!;

  return {
    companyDefault: {
      id: companyDefaultRow.id,
      scope: companyDefaultRow.scope,
      executiveId: null,
      executiveName: null,
      year: null,
      month: null,
      targetModules: companyDefaultRow.targetModules,
    },
    executiveDefaults: rows
      .filter((row) => row.scope === SalesModuleTargetScope.EXECUTIVE_DEFAULT)
      .map((row) => ({
        id: row.id,
        scope: row.scope,
        executiveId: row.executiveId,
        executiveName: row.executive?.name ?? null,
        year: null,
        month: null,
        targetModules: row.targetModules,
      })),
    monthlyOverrides: rows
      .filter((row) => row.scope === SalesModuleTargetScope.MONTHLY_OVERRIDE)
      .map((row) => ({
        id: row.id,
        scope: row.scope,
        executiveId: row.executiveId,
        executiveName: row.executive?.name ?? null,
        year: row.year,
        month: row.month,
        targetModules: row.targetModules,
      })),
  };
}

export class SalesTargetError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" = "VALIDATION_ERROR",
  ) {
    super(message);
  }
}

function assertPositiveTarget(targetModules: number) {
  if (!Number.isInteger(targetModules) || targetModules <= 0) {
    throw new SalesTargetError("Target must be a positive whole number.");
  }
}

function assertYearMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new SalesTargetError("Year is invalid.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new SalesTargetError("Month must be between 1 and 12.");
  }
}

async function assertExecutiveInCompany(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
) {
  const membership = await prisma.userCompany.findFirst({
    where: { companyId, userId: executiveId },
  });
  if (!membership) {
    throw new SalesTargetError("Executive is not a member of this company.");
  }
}

/** Convenience for dashboard: current business month progress. */
export async function getCurrentMonthModuleTargetProgress(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
): Promise<ModuleTargetProgressDto> {
  return getModuleTargetProgress(prisma, companyId, executiveId, new Date());
}

export function getCurrentBusinessYearMonth(asOf = new Date()): {
  year: number;
  month: number;
  businessDate: string;
} {
  const businessDate = getBusinessToday(asOf);
  const { year, month } = getBusinessMonthRange(asOf);
  return { year, month, businessDate };
}
