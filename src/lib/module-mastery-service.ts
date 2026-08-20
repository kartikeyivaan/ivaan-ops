import {
  DispatchStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  endOfBusinessDay,
  getBusinessMonthRange,
  parseBusinessDate,
  parseBusinessDateString,
} from "@/lib/business-dates";
import { decimalToNumber } from "@/lib/inventory";
import { sumDispatchedUnitsFromLines, listSalesExecutivesForCompany } from "@/lib/report-builders";
import { canViewTeamSalesDashboard } from "@/lib/sales-dashboard/dashboard-permissions";
import { isSuperAdmin } from "@/lib/rbac";

export const DEFAULT_MASTERY_SLAB_SIZE = 500;
export const DEFAULT_NAMED_LEVEL_COUNT = 15;
export const DEFAULT_GOD_LEVEL_INCREMENT = 500;

export const DEFAULT_NAMED_LEVELS: Array<{
  levelNumber: number;
  name: string;
  badge: string;
}> = [
  { levelNumber: 1, name: "Rookie", badge: "🌱" },
  { levelNumber: 2, name: "Spark", badge: "🔥" },
  { levelNumber: 3, name: "Charged", badge: "⚡" },
  { levelNumber: 4, name: "Power Player", badge: "🛡️" },
  { levelNumber: 5, name: "Rising Star", badge: "🚀" },
  { levelNumber: 6, name: "Solar Striker", badge: "💥" },
  { levelNumber: 7, name: "Energy Hunter", badge: "🔥" },
  { levelNumber: 8, name: "Power Master", badge: "⚡" },
  { levelNumber: 9, name: "Solar Champion", badge: "🏆" },
  { levelNumber: 10, name: "Elite Performer", badge: "👑" },
  { levelNumber: 11, name: "Legend", badge: "🌟" },
  { levelNumber: 12, name: "Titan", badge: "⚔️" },
  { levelNumber: 13, name: "Solar Titan", badge: "🔱" },
  { levelNumber: 14, name: "Energy Overlord", badge: "🌌" },
  { levelNumber: 15, name: "Ultimate Legend", badge: "👑⚡" },
];

export type NamedLevelDefinition = {
  levelNumber: number;
  name: string;
  badge: string;
  thresholdModules: number;
};

export type MasteryEngineConfig = {
  slabSize: number;
  namedLevelCount: number;
  godLevelIncrement: number;
  godLevelsEnabled: boolean;
  levels: NamedLevelDefinition[];
};

export type MasteryMilestone = {
  levelNumber: number;
  levelName: string;
  isGodLevel: boolean;
  godLevelRank: number;
  thresholdModules: number;
};

export type ModuleMasteryLevelResult = {
  modulesDispatched: number;
  currentLevelNumber: number;
  currentLevelName: string;
  currentLevelBadge: string;
  currentSlabProgress: number;
  slabSize: number;
  nextLevelThreshold: number;
  modulesToNext: number;
  highestCompletedLevel: number;
  isGodLevel: boolean;
  /** Current active God challenge rank (1 = God I). 0 when on named levels. */
  godLevelRank: number;
  progressPercent: number;
  completedMilestones: MasteryMilestone[];
};

export type ModuleMasteryProgressDto = {
  year: number;
  month: number;
  modulesDispatched: number;
  currentLevelNumber: number;
  currentLevelName: string;
  currentLevelBadge: string;
  currentSlabProgress: number;
  slabSize: number;
  nextLevelThreshold: number;
  modulesToNext: number;
  highestCompletedLevel: number;
  isGodLevel: boolean;
  godLevelRank: number;
  progressPercent: number;
  nextLevelName: string;
  nextLevelBadge: string;
  pendingCelebrations: Array<{
    id: string;
    levelNumber: number;
    levelName: string;
    isGodLevel: boolean;
    godLevelRank: number;
    thresholdModules: number;
  }>;
};

export type ModuleMasteryJourneyAchievementDto = {
  id: string;
  levelNumber: number;
  levelName: string;
  badge: string;
  isGodLevel: boolean;
  godLevelRank: number;
  thresholdModules: number;
  achievedAt: string;
  year: number;
  month: number;
};

export type ModuleMasteryJourneyDto = {
  executiveId: string;
  executiveName: string;
  current: ModuleMasteryProgressDto;
  completedThisMonth: ModuleMasteryJourneyAchievementDto[];
  achievementTimeline: ModuleMasteryJourneyAchievementDto[];
  monthlyHistory: Array<{
    year: number;
    month: number;
    modulesDispatched: number;
    highestCompletedLevel: number;
    currentLevelName: string;
  }>;
  stats: {
    personalBestModules: number;
    personalBestMonth: { year: number; month: number } | null;
    highestLevelName: string;
    highestLevelNumber: number;
    lifetimeModules: number;
  };
  levels: NamedLevelDefinition[];
};

function toRoman(value: number): string {
  const map: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [num, glyph] of map) {
    while (remaining >= num) {
      out += glyph;
      remaining -= num;
    }
  }
  return out || String(value);
}

export function godLevelDisplayName(rank: number): string {
  return `God Level ${toRoman(rank)}`;
}

export function getNextLevelPreview(
  config: MasteryEngineConfig,
  result: Pick<
    ModuleMasteryLevelResult,
    | "currentLevelNumber"
    | "isGodLevel"
    | "godLevelRank"
    | "highestCompletedLevel"
    | "modulesToNext"
  >,
): { name: string; badge: string } {
  if (
    !config.godLevelsEnabled &&
    result.highestCompletedLevel >= config.namedLevelCount
  ) {
    return { name: "Ultimate Legend", badge: "👑⚡" };
  }

  if (result.isGodLevel) {
    return {
      name: godLevelDisplayName(result.godLevelRank + 1),
      badge: "♾️",
    };
  }

  if (result.currentLevelNumber >= config.namedLevelCount && config.godLevelsEnabled) {
    return { name: godLevelDisplayName(1), badge: "♾️" };
  }

  const nextLevel = config.levels.find(
    (level) => level.levelNumber === result.currentLevelNumber + 1,
  );
  if (nextLevel) {
    return {
      name: `Level ${nextLevel.levelNumber} — ${nextLevel.name}`,
      badge: nextLevel.badge,
    };
  }

  return { name: godLevelDisplayName(1), badge: "♾️" };
}

function badgeForAchievement(
  config: MasteryEngineConfig,
  achievement: {
    levelNumber: number;
    levelName: string;
    isGodLevel: boolean;
    godLevelRank: number;
  },
): string {
  if (achievement.isGodLevel) return "♾️";
  return (
    config.levels.find((level) => level.levelNumber === achievement.levelNumber)?.badge ??
    "🌱"
  );
}

export function buildDefaultMasteryEngineConfig(
  slabSize = DEFAULT_MASTERY_SLAB_SIZE,
): MasteryEngineConfig {
  const levels = DEFAULT_NAMED_LEVELS.map((level) => ({
    ...level,
    thresholdModules: level.levelNumber * slabSize,
  }));
  return {
    slabSize,
    namedLevelCount: DEFAULT_NAMED_LEVEL_COUNT,
    godLevelIncrement: DEFAULT_GOD_LEVEL_INCREMENT,
    godLevelsEnabled: true,
    levels,
  };
}

/**
 * Pure Module Mastery level engine.
 *
 * Active challenge after an exact threshold is the *next* level (PRD §9).
 * God levels begin immediately after named level 15 completes (7500 default).
 */
export function calculateModuleMasteryLevel(
  totalModules: number,
  config: MasteryEngineConfig,
): ModuleMasteryLevelResult {
  const modules = Math.max(0, Math.floor(totalModules));
  const slabSize = config.slabSize;
  const namedCount = config.namedLevelCount;
  const godIncrement = config.godLevelIncrement;
  const namedCap = namedCount * slabSize;
  const levelsByNumber = new Map(config.levels.map((level) => [level.levelNumber, level]));

  const completedMilestones: MasteryMilestone[] = [];

  for (let level = 1; level <= namedCount; level += 1) {
    const threshold = level * slabSize;
    if (modules < threshold) break;
    const named = levelsByNumber.get(level);
    completedMilestones.push({
      levelNumber: level,
      levelName: named?.name ?? `Level ${level}`,
      isGodLevel: false,
      godLevelRank: 0,
      thresholdModules: threshold,
    });
  }

  if (config.godLevelsEnabled && modules >= namedCap) {
    const excess = modules - namedCap;
    const completedGodRanks = Math.floor(excess / godIncrement);
    for (let rank = 1; rank <= completedGodRanks; rank += 1) {
      completedMilestones.push({
        levelNumber: namedCount + rank,
        levelName: godLevelDisplayName(rank),
        isGodLevel: true,
        godLevelRank: rank,
        thresholdModules: namedCap + rank * godIncrement,
      });
    }
  }

  if (modules < namedCap || !config.godLevelsEnabled) {
    const highestCompletedLevel = Math.min(namedCount, Math.floor(modules / slabSize));
    const currentLevelNumber = Math.min(namedCount, highestCompletedLevel + 1);
    const named = levelsByNumber.get(currentLevelNumber);
    const previousThreshold = (currentLevelNumber - 1) * slabSize;
    const nextLevelThreshold = currentLevelNumber * slabSize;
    const currentSlabProgress = modules - previousThreshold;
    const modulesToNext = Math.max(0, nextLevelThreshold - modules);

    // If god disabled and at/above named cap, stay on final named level with full slab.
    const atCapWithoutGod =
      !config.godLevelsEnabled && modules >= namedCap
        ? {
            currentLevelNumber: namedCount,
            currentLevelName: levelsByNumber.get(namedCount)?.name ?? `Level ${namedCount}`,
            currentLevelBadge: levelsByNumber.get(namedCount)?.badge ?? "👑",
            currentSlabProgress: slabSize,
            nextLevelThreshold: namedCap,
            modulesToNext: 0,
            highestCompletedLevel: namedCount,
            progressPercent: 100,
          }
        : null;

    if (atCapWithoutGod) {
      return {
        modulesDispatched: modules,
        ...atCapWithoutGod,
        slabSize,
        isGodLevel: false,
        godLevelRank: 0,
        completedMilestones,
      };
    }

    return {
      modulesDispatched: modules,
      currentLevelNumber,
      currentLevelName: named?.name ?? `Level ${currentLevelNumber}`,
      currentLevelBadge: named?.badge ?? "🌱",
      currentSlabProgress,
      slabSize,
      nextLevelThreshold,
      modulesToNext,
      highestCompletedLevel,
      isGodLevel: false,
      godLevelRank: 0,
      progressPercent: Math.round((currentSlabProgress / slabSize) * 1000) / 10,
      completedMilestones,
    };
  }

  const excess = modules - namedCap;
  const completedGodRanks = Math.floor(excess / godIncrement);
  const godLevelRank = completedGodRanks + 1;
  const currentLevelNumber = namedCount + godLevelRank;
  const previousThreshold = namedCap + completedGodRanks * godIncrement;
  const nextLevelThreshold = namedCap + godLevelRank * godIncrement;
  const currentSlabProgress = modules - previousThreshold;
  const modulesToNext = Math.max(0, nextLevelThreshold - modules);

  return {
    modulesDispatched: modules,
    currentLevelNumber,
    currentLevelName: godLevelDisplayName(godLevelRank),
    currentLevelBadge: "♾️",
    currentSlabProgress,
    slabSize: godIncrement,
    nextLevelThreshold,
    modulesToNext,
    highestCompletedLevel: namedCount + completedGodRanks,
    isGodLevel: true,
    godLevelRank,
    progressPercent: Math.round((currentSlabProgress / godIncrement) * 1000) / 10,
    completedMilestones,
  };
}

export async function ensureModuleMasterySetup(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
) {
  const existingConfig = await prisma.moduleMasteryConfig.findUnique({
    where: { companyId },
  });
  if (!existingConfig) {
    await prisma.moduleMasteryConfig.create({
      data: {
        companyId,
        slabSize: DEFAULT_MASTERY_SLAB_SIZE,
        namedLevelCount: DEFAULT_NAMED_LEVEL_COUNT,
        godLevelIncrement: DEFAULT_GOD_LEVEL_INCREMENT,
      },
    });
  }

  const levelCount = await prisma.moduleMasteryLevel.count({ where: { companyId } });
  if (levelCount === 0) {
    const config =
      existingConfig ??
      (await prisma.moduleMasteryConfig.findUniqueOrThrow({ where: { companyId } }));
    await prisma.moduleMasteryLevel.createMany({
      data: DEFAULT_NAMED_LEVELS.map((level) => ({
        companyId,
        levelNumber: level.levelNumber,
        name: level.name,
        badge: level.badge,
        thresholdModules: level.levelNumber * config.slabSize,
        sortOrder: level.levelNumber,
      })),
    });
  }

  return loadMasteryEngineConfig(prisma, companyId);
}

export async function loadMasteryEngineConfig(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
): Promise<MasteryEngineConfig> {
  const config = await prisma.moduleMasteryConfig.findUnique({ where: { companyId } });
  if (!config) return buildDefaultMasteryEngineConfig();

  const levels = await prisma.moduleMasteryLevel.findMany({
    where: { companyId, isActive: true },
    orderBy: { levelNumber: "asc" },
  });

  return {
    slabSize: config.slabSize,
    namedLevelCount: config.namedLevelCount,
    godLevelIncrement: config.godLevelIncrement,
    godLevelsEnabled: config.godLevelsEnabled,
    levels: levels.map((level) => ({
      levelNumber: level.levelNumber,
      name: level.name,
      badge: level.badge,
      thresholdModules: level.thresholdModules,
    })),
  };
}

export async function sumExecutiveModulesForMonth(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  executiveId: string,
  year: number,
  month: number,
): Promise<number> {
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId,
      status: DispatchStatus.DISPATCHED,
      proformaInvoice: { salesUserId: executiveId },
      dispatchDate: {
        gte: parseBusinessDate(fromDate),
        lte: endOfBusinessDay(toDate),
      },
    },
    select: {
      lines: {
        select: {
          qty: true,
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });

  return sumDispatchedUnitsFromLines(dispatches).modules;
}

export async function recalculateExecutiveModuleMastery(
  prisma: PrismaClient,
  input: {
    companyId: string;
    executiveId: string;
    year: number;
    month: number;
  },
) {
  const config = await ensureModuleMasterySetup(prisma, input.companyId);
  const modules = await sumExecutiveModulesForMonth(
    prisma,
    input.companyId,
    input.executiveId,
    input.year,
    input.month,
  );
  const result = calculateModuleMasteryLevel(modules, config);
  const now = new Date();

  const progress = await prisma.executiveModuleMasteryProgress.upsert({
    where: {
      companyId_executiveId_year_month: {
        companyId: input.companyId,
        executiveId: input.executiveId,
        year: input.year,
        month: input.month,
      },
    },
    create: {
      companyId: input.companyId,
      executiveId: input.executiveId,
      year: input.year,
      month: input.month,
      modulesDispatched: modules,
      currentLevelNumber: result.currentLevelNumber,
      currentLevelName: result.currentLevelName,
      currentSlabProgress: result.currentSlabProgress,
      nextLevelThreshold: result.nextLevelThreshold,
      highestCompletedLevel: result.highestCompletedLevel,
      isGodLevel: result.isGodLevel,
      godLevelRank: result.godLevelRank,
      lastCalculatedAt: now,
    },
    update: {
      modulesDispatched: modules,
      currentLevelNumber: result.currentLevelNumber,
      currentLevelName: result.currentLevelName,
      currentSlabProgress: result.currentSlabProgress,
      nextLevelThreshold: result.nextLevelThreshold,
      highestCompletedLevel: result.highestCompletedLevel,
      isGodLevel: result.isGodLevel,
      godLevelRank: result.godLevelRank,
      lastCalculatedAt: now,
    },
  });

  const existingAchievements = await prisma.executiveModuleLevelAchievement.findMany({
    where: {
      companyId: input.companyId,
      executiveId: input.executiveId,
      year: input.year,
      month: input.month,
    },
  });

  const keepKeys = new Set(
    result.completedMilestones.map(
      (milestone) => `${milestone.levelNumber}:${milestone.godLevelRank}`,
    ),
  );

  const toDelete = existingAchievements.filter(
    (row) => !keepKeys.has(`${row.levelNumber}:${row.godLevelRank}`),
  );
  if (toDelete.length > 0) {
    await prisma.executiveModuleLevelAchievement.deleteMany({
      where: { id: { in: toDelete.map((row) => row.id) } },
    });
  }

  const existingKeys = new Set(
    existingAchievements.map((row) => `${row.levelNumber}:${row.godLevelRank}`),
  );
  const toCreate = result.completedMilestones.filter(
    (milestone) => !existingKeys.has(`${milestone.levelNumber}:${milestone.godLevelRank}`),
  );

  if (toCreate.length > 0) {
    await prisma.executiveModuleLevelAchievement.createMany({
      data: toCreate.map((milestone) => ({
        companyId: input.companyId,
        executiveId: input.executiveId,
        year: input.year,
        month: input.month,
        levelNumber: milestone.levelNumber,
        levelName: milestone.levelName,
        isGodLevel: milestone.isGodLevel,
        godLevelRank: milestone.godLevelRank,
        thresholdModules: milestone.thresholdModules,
        achievedAt: now,
      })),
    });
  }

  return { progress, result };
}

export async function recalculateModuleMasteryForDispatch(
  prisma: PrismaClient,
  input: { companyId: string; dispatchId: string },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    select: {
      dispatchDate: true,
      proformaInvoice: { select: { salesUserId: true } },
    },
  });
  if (!dispatch?.proformaInvoice.salesUserId) return null;

  const dateKey = dispatch.dispatchDate.toISOString().slice(0, 10);
  const { year, month } = parseBusinessDateString(dateKey);

  return recalculateExecutiveModuleMastery(prisma, {
    companyId: input.companyId,
    executiveId: dispatch.proformaInvoice.salesUserId,
    year,
    month,
  });
}

export async function recalculateAllExecutivesForMonth(
  prisma: PrismaClient,
  companyId: string,
  year: number,
  month: number,
) {
  const executives = await listSalesExecutivesForCompany(prisma, companyId);
  const results = [];
  for (const executive of executives) {
    results.push(
      await recalculateExecutiveModuleMastery(prisma, {
        companyId,
        executiveId: executive.id,
        year,
        month,
      }),
    );
  }
  return results;
}

export async function getExecutiveModuleMastery(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  asOf = new Date(),
): Promise<ModuleMasteryProgressDto> {
  const { year, month } = getBusinessMonthRange(asOf);
  await recalculateExecutiveModuleMastery(prisma, {
    companyId,
    executiveId,
    year,
    month,
  });

  const config = await loadMasteryEngineConfig(prisma, companyId);
  const progress = await prisma.executiveModuleMasteryProgress.findUniqueOrThrow({
    where: {
      companyId_executiveId_year_month: {
        companyId,
        executiveId,
        year,
        month,
      },
    },
  });

  const modules = decimalToNumber(progress.modulesDispatched);
  const computed = calculateModuleMasteryLevel(modules, config);
  const nextLevel = getNextLevelPreview(config, computed);

  const pendingCelebrations = await prisma.executiveModuleLevelAchievement.findMany({
    where: {
      companyId,
      executiveId,
      year,
      month,
      celebrationAcknowledgedAt: null,
    },
    orderBy: [{ thresholdModules: "asc" }],
    select: {
      id: true,
      levelNumber: true,
      levelName: true,
      isGodLevel: true,
      godLevelRank: true,
      thresholdModules: true,
    },
  });

  return {
    year,
    month,
    modulesDispatched: modules,
    currentLevelNumber: computed.currentLevelNumber,
    currentLevelName: computed.currentLevelName,
    currentLevelBadge: computed.currentLevelBadge,
    currentSlabProgress: computed.currentSlabProgress,
    slabSize: computed.slabSize,
    nextLevelThreshold: computed.nextLevelThreshold,
    modulesToNext: computed.modulesToNext,
    highestCompletedLevel: computed.highestCompletedLevel,
    isGodLevel: computed.isGodLevel,
    godLevelRank: computed.godLevelRank,
    progressPercent: computed.progressPercent,
    nextLevelName: nextLevel.name,
    nextLevelBadge: nextLevel.badge,
    pendingCelebrations,
  };
}

export async function getExecutiveModuleJourney(
  prisma: PrismaClient,
  companyId: string,
  executiveId: string,
  asOf = new Date(),
): Promise<ModuleMasteryJourneyDto> {
  const config = await ensureModuleMasterySetup(prisma, companyId);
  const current = await getExecutiveModuleMastery(prisma, companyId, executiveId, asOf);

  const [executive, achievements, progressRows] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: executiveId },
      select: { id: true, name: true },
    }),
    prisma.executiveModuleLevelAchievement.findMany({
      where: { companyId, executiveId },
      orderBy: [{ achievedAt: "desc" }],
    }),
    prisma.executiveModuleMasteryProgress.findMany({
      where: { companyId, executiveId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    }),
  ]);

  const mapAchievement = (
    row: (typeof achievements)[number],
  ): ModuleMasteryJourneyAchievementDto => ({
    id: row.id,
    levelNumber: row.levelNumber,
    levelName: row.levelName,
    badge: badgeForAchievement(config, row),
    isGodLevel: row.isGodLevel,
    godLevelRank: row.godLevelRank,
    thresholdModules: row.thresholdModules,
    achievedAt: row.achievedAt.toISOString(),
    year: row.year,
    month: row.month,
  });

  const completedThisMonth = achievements
    .filter((row) => row.year === current.year && row.month === current.month)
    .sort((a, b) => a.thresholdModules - b.thresholdModules)
    .map(mapAchievement);

  const achievementTimeline = achievements.map(mapAchievement);

  const monthlyHistory = progressRows
    .map((row) => ({
      year: row.year,
      month: row.month,
      modulesDispatched: decimalToNumber(row.modulesDispatched),
      highestCompletedLevel: row.highestCompletedLevel,
      currentLevelName: row.currentLevelName,
    }))
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));

  let personalBestModules = 0;
  let personalBestMonth: { year: number; month: number } | null = null;
  let lifetimeModules = 0;
  for (const row of monthlyHistory) {
    lifetimeModules += row.modulesDispatched;
    if (row.modulesDispatched > personalBestModules) {
      personalBestModules = row.modulesDispatched;
      personalBestMonth = { year: row.year, month: row.month };
    }
  }

  let highestLevelNumber = 0;
  let highestLevelName = "Rookie";
  for (const row of achievements) {
    const rankScore = row.isGodLevel
      ? config.namedLevelCount + row.godLevelRank
      : row.levelNumber;
    if (rankScore > highestLevelNumber) {
      highestLevelNumber = rankScore;
      highestLevelName = row.levelName;
    }
  }
  if (highestLevelNumber === 0) {
    highestLevelName = current.currentLevelName;
    highestLevelNumber = current.isGodLevel
      ? config.namedLevelCount + current.godLevelRank
      : current.currentLevelNumber;
  }

  return {
    executiveId,
    executiveName: executive.name,
    current,
    completedThisMonth,
    achievementTimeline,
    monthlyHistory,
    stats: {
      personalBestModules,
      personalBestMonth,
      highestLevelName,
      highestLevelNumber,
      lifetimeModules,
    },
    levels: config.levels,
  };
}

export async function acknowledgeAllPendingCelebrations(
  prisma: PrismaClient,
  input: { companyId: string; executiveId: string; year: number; month: number },
) {
  const now = new Date();
  const pending = await prisma.executiveModuleLevelAchievement.findMany({
    where: {
      companyId: input.companyId,
      executiveId: input.executiveId,
      year: input.year,
      month: input.month,
      celebrationAcknowledgedAt: null,
    },
  });

  if (pending.length === 0) return { acknowledged: 0 };

  await prisma.executiveModuleLevelAchievement.updateMany({
    where: { id: { in: pending.map((row) => row.id) } },
    data: {
      celebrationAcknowledgedAt: now,
      celebrationShownAt: now,
    },
  });

  return { acknowledged: pending.length };
}

export async function acknowledgeMasteryCelebration(
  prisma: PrismaClient,
  input: { companyId: string; executiveId: string; achievementId: string },
) {
  const row = await prisma.executiveModuleLevelAchievement.findFirst({
    where: {
      id: input.achievementId,
      companyId: input.companyId,
      executiveId: input.executiveId,
    },
  });
  if (!row) throw new ModuleMasteryError("Achievement not found.", "NOT_FOUND");

  const now = new Date();
  return prisma.executiveModuleLevelAchievement.update({
    where: { id: row.id },
    data: {
      celebrationShownAt: row.celebrationShownAt ?? now,
      celebrationAcknowledgedAt: now,
    },
  });
}

export function canRecalculateModuleMastery(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles) || canViewTeamSalesDashboard(userRoles);
}

export class ModuleMasteryError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" = "VALIDATION_ERROR",
  ) {
    super(message);
  }
}
