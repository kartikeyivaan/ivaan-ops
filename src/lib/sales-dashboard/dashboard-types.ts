import type { DashboardPeriod } from "@/lib/business-dates";
import type { AgeingBucket } from "@/lib/reports";
import type { ApprovalType } from "@/lib/approvals-service";
import type { ExecutiveKpiSummary, KpiStripDto } from "@/lib/report-builders";

export type SalesDashboardScope = {
  /** One or more company IDs included in this dashboard view. */
  companyIds: string[];
  restrictToUserId: string | null;
  canViewTeam: boolean;
  userId: string;
  roles: string[];
};

export type DispatchTodayHeroDto = {
  businessDate: string;
  planned: number;
  completed: number;
  pending: number;
  blocked: number;
  completionPercent: number;
  moduleUnits: number;
  inverterUnits: number;
  otherUnits: number;
  items: Array<{
    piId: string;
    piNo: string;
    customerName: string;
    status: "completed" | "pending" | "blocked";
    salesUserId: string;
    salesExecutiveName: string;
  }>;
};

export type WorkQueueItem =
  | {
      kind: "expiring_quotation";
      id: string;
      quotationNo: string;
      customerName: string;
      expiryDate: string;
      urgency: "today" | "soon" | "expired";
      href: string;
    }
  | {
      kind: "unpaid_pi";
      id: string;
      piNo: string;
      customerName: string;
      piValue: number;
      paid: number;
      outstanding: number;
      ageingDays: number;
      href: string;
    }
  | {
      kind: "quiet_customer";
      id: string;
      customerName: string;
      lastActivityDate: string | null;
      inactiveDays: number;
      href: string;
    }
  | {
      kind: "stuck_pi";
      id: string;
      piNo: string;
      customerName: string;
      status: string;
      daysInStatus: number;
      piValue: number;
      href: string;
    };

export type WorkQueueDto = {
  expiringQuotations: WorkQueueItem[];
  unpaidPis: WorkQueueItem[];
  quietCustomers: WorkQueueItem[];
  stuckPis: WorkQueueItem[];
  counts: {
    expiringQuotations: number;
    unpaidPis: number;
    quietCustomers: number;
    stuckPis: number;
  };
};

export type OutstandingAgingBucketDto = {
  bucket: AgeingBucket;
  totalOutstanding: number;
  piCount: number;
};

export type OutstandingAgingDto = {
  totalOutstanding: number;
  buckets: OutstandingAgingBucketDto[];
};

export type SalesStockWatchItemDto = {
  productId: string;
  productName: string;
  brandName: string;
  openRequirement: number;
  available: number;
  booked: number;
  upcoming: number;
  freeQty: number;
  status: "AVAILABLE" | "LOW" | "SHORT" | "CONFLICT";
  warehouseId: string | null;
  warehouseName: string | null;
};

export type SalesStockWatchDto = {
  items: SalesStockWatchItemDto[];
};

export type SalesFunnelDto = {
  quotationValue: number;
  piValue: number;
  collectionValue: number;
  dispatchedValue: number;
  conversion: {
    quotationToPi: number | null;
    piToCollection: number | null;
    collectionToDispatch: number | null;
  };
};

export type PerformanceTrendPointDto = {
  date: string;
  value: number;
};

export type PerformanceTrendDto = {
  metric: "modules" | "dispatch" | "collection" | "pi";
  points: PerformanceTrendPointDto[];
};

export type ApprovalSummaryDto = {
  total: number;
  oldestWaitingDays: number | null;
  byType: Partial<Record<ApprovalType, number>>;
};

export type TeamScoreboardDto = {
  period: DashboardPeriod;
  fromDate: string;
  toDate: string;
  rows: ExecutiveKpiSummary[];
};

export type PipelineRiskDto = {
  expiringQuotations: WorkQueueItem[];
  bookedNotDispatched: Array<{
    piId: string;
    piNo: string;
    customerName: string;
    daysSinceBooking: number;
    executiveName: string;
    href: string;
  }>;
  highOutstanding: Array<{
    customerId: string;
    customerName: string;
    outstanding: number;
    ageingDays: number;
    executiveName: string;
  }>;
  stuckPis: WorkQueueItem[];
};

export type StockConflictDto = {
  productId: string;
  productName: string;
  available: number;
  booked: number;
  upcoming: number;
  freeQty: number;
  required: number;
  shortBy: number;
};

export type DispatchedUnitCompositionDto = {
  modules: number;
  inverters: number;
  other: number;
};

export type ModuleTargetProgressDto = {
  year: number;
  month: number;
  targetModules: number;
  achievedModules: number;
  remainingModules: number;
  progressPercent: number;
  source: "COMPANY_DEFAULT" | "EXECUTIVE_DEFAULT" | "MONTHLY_OVERRIDE" | "HARD_DEFAULT";
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

export type ExecutiveDashboardDto = {
  role: "executive";
  businessDate: string;
  period: DashboardPeriod;
  fromDate: string;
  toDate: string;
  kpiStrip: KpiStripDto;
  dispatchToday: DispatchTodayHeroDto;
  workQueue: WorkQueueDto;
  outstandingAging: OutstandingAgingDto;
  stockWatch: SalesStockWatchDto;
  funnel: SalesFunnelDto;
  trend: PerformanceTrendDto;
  unitComposition: DispatchedUnitCompositionDto;
  moduleTarget: ModuleTargetProgressDto;
  moduleMastery: ModuleMasteryProgressDto;
};

export type ManagerDashboardDto = {
  role: "manager";
  businessDate: string;
  period: DashboardPeriod;
  fromDate: string;
  toDate: string;
  kpiStrip: KpiStripDto;
  approvalSummary: ApprovalSummaryDto;
  teamScoreboard: TeamScoreboardDto;
  dispatchOperations: DispatchTodayHeroDto;
  pipelineRisks: PipelineRiskDto;
  stockConflicts: StockConflictDto[];
  funnel: SalesFunnelDto;
  trend: PerformanceTrendDto;
  unitComposition: DispatchedUnitCompositionDto;
};

export type SalesDashboardDto = ExecutiveDashboardDto | ManagerDashboardDto;
