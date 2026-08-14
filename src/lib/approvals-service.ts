import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DamageReportStatus,
  DispatchStatus,
  IncomingLotChangeStatus,
  ItemApprovalStatus,
  OpeningAuditStatus,
  PrismaClient,
  ProformaInvoiceStatus,
  ProjectProposalApprovalStatus,
  ProjectProposalStatus,
} from "@prisma/client";
import { canApproveDispatchCancel } from "@/lib/dispatch-permissions";
import { DAMAGE_CATEGORY_LABELS } from "@/lib/damage-report-constants";
import { canApproveOpeningStock } from "@/lib/inventory-audit-permissions";
import {
  canApproveIncomingLotEdit,
  canApprovePanelDamage,
} from "@/lib/inventory-permissions";
import { canApproveBooking, canApproveDispatchToday, canApprovePiCancel, canApprovePiCreditAccounts, canApprovePiCreditSm } from "@/lib/pi-permissions";
import { canApproveProjectProposals } from "@/lib/project-proposal-permissions";
import { canEditProjectMaterial } from "@/lib/project-permissions";
import { canApproveQuotationPricing } from "@/lib/quotation-permissions";

export type ApprovalType =
  | "QUOTATION_PRICE"
  | "PI_BOOKING"
  | "DISPATCH_TODAY"
  | "DC_CANCEL"
  | "PI_CANCEL"
  | "PI_CREDIT"
  | "PI_CREDIT_ACCOUNTS"
  | "PROJECT_PROPOSAL"
  | "PROJECT_MATERIAL"
  | "OPENING_STOCK"
  | "PANEL_DAMAGE"
  | "CROSS_COMPANY_TRANSFER"
  | "INCOMING_LOT_EDIT";

export type PendingApprovalItem = {
  id: string;
  type: ApprovalType;
  moduleId: string;
  documentNo: string;
  subjectName: string;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
  href: string;
  canReject: boolean;
};

export type ApprovalHistoryItem = {
  id: string;
  type: ApprovalType;
  moduleId: string;
  documentNo: string;
  subjectName: string;
  reason: string;
  decision: "APPROVED" | "REJECTED";
  requestedByName: string | null;
  decidedByName: string | null;
  requestedAt: string;
  decidedAt: string;
  href: string;
};

const TYPE_LABELS: Record<ApprovalType, string> = {
  QUOTATION_PRICE: "Quotation pricing",
  PI_BOOKING: "PI booking",
  DISPATCH_TODAY: "Dispatch today",
  DC_CANCEL: "DC cancel",
  PI_CANCEL: "PI cancel",
  PI_CREDIT: "PI credit (Sales Manager)",
  PI_CREDIT_ACCOUNTS: "PI credit (Accounts)",
  PROJECT_PROPOSAL: "Project proposal",
  PROJECT_MATERIAL: "Project material approval",
  OPENING_STOCK: "Opening stock",
  PANEL_DAMAGE: "Panel damage",
  CROSS_COMPANY_TRANSFER: "Cross-company transfer",
  INCOMING_LOT_EDIT: "Incoming lot edit",
};

export function approvalTypeLabel(type: ApprovalType): string {
  return TYPE_LABELS[type];
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function toIso(value: Date): string {
  return value.toISOString();
}

export async function countPendingApprovalsForUser(
  prisma: PrismaClient,
  companyId: string,
  userRoles: string[],
): Promise<number> {
  const items = await listPendingApprovals(prisma, companyId, userRoles);
  return items.length;
}

export async function listPendingApprovals(
  prisma: PrismaClient,
  companyId: string,
  userRoles: string[],
): Promise<PendingApprovalItem[]> {
  const buckets: Promise<PendingApprovalItem[]>[] = [];

  if (canApproveQuotationPricing(userRoles)) {
    buckets.push(listPendingQuotationApprovals(prisma, companyId));
  }
  if (canApproveBooking(userRoles)) {
    buckets.push(listPendingBookingApprovals(prisma, companyId));
  }
  if (canApproveDispatchToday(userRoles)) {
    buckets.push(listPendingDispatchTodayApprovals(prisma, companyId));
    buckets.push(listPendingCrossCompanyTransferApprovals(prisma, companyId));
  }
  if (canApproveDispatchCancel(userRoles)) {
    buckets.push(listPendingDcCancelApprovals(prisma, companyId));
  }
  if (canApprovePiCancel(userRoles)) {
    buckets.push(listPendingPiCancelApprovals(prisma, companyId));
  }
  if (canApprovePiCreditSm(userRoles)) {
    buckets.push(listPendingPiCreditSmApprovals(prisma, companyId));
  }
  if (canApprovePiCreditAccounts(userRoles)) {
    buckets.push(listPendingPiCreditAccountsApprovals(prisma, companyId));
  }
  if (canApproveProjectProposals(userRoles)) {
    buckets.push(listPendingProposalApprovals(prisma, companyId));
  }
  if (canEditProjectMaterial(userRoles)) {
    buckets.push(listPendingProjectMaterialApprovals(prisma, companyId));
  }
  if (canApproveOpeningStock(userRoles)) {
    buckets.push(listPendingOpeningStockApprovals(prisma, companyId));
  }
  if (canApprovePanelDamage(userRoles)) {
    buckets.push(listPendingPanelDamageApprovals(prisma, companyId));
  }
  if (canApproveIncomingLotEdit(userRoles)) {
    buckets.push(listPendingIncomingLotEditApprovals(prisma, companyId));
  }

  const groups = await Promise.all(buckets);
  return groups.flat().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function listApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
  userRoles: string[],
  limit = 100,
): Promise<ApprovalHistoryItem[]> {
  const buckets: Promise<ApprovalHistoryItem[]>[] = [];

  if (canApproveQuotationPricing(userRoles)) {
    buckets.push(listQuotationApprovalHistory(prisma, companyId));
  }
  if (canApproveBooking(userRoles)) {
    buckets.push(listBookingApprovalHistory(prisma, companyId));
  }
  if (canApproveDispatchToday(userRoles)) {
    buckets.push(listDispatchTodayApprovalHistory(prisma, companyId));
    buckets.push(listCrossCompanyTransferApprovalHistory(prisma, companyId));
  }
  if (canApproveDispatchCancel(userRoles)) {
    buckets.push(listDcCancelApprovalHistory(prisma, companyId));
  }
  if (canApprovePiCancel(userRoles)) {
    buckets.push(listPiCancelApprovalHistory(prisma, companyId));
  }
  if (canApprovePiCreditSm(userRoles) || canApprovePiCreditAccounts(userRoles)) {
    buckets.push(listPiCreditApprovalHistory(prisma, companyId));
  }
  if (canApproveProjectProposals(userRoles)) {
    buckets.push(listProposalApprovalHistory(prisma, companyId));
  }
  if (canEditProjectMaterial(userRoles)) {
    buckets.push(listProjectMaterialApprovalHistory(prisma, companyId));
  }
  if (canApproveOpeningStock(userRoles)) {
    buckets.push(listOpeningStockApprovalHistory(prisma, companyId));
  }
  if (canApprovePanelDamage(userRoles)) {
    buckets.push(listPanelDamageApprovalHistory(prisma, companyId));
  }
  if (canApproveIncomingLotEdit(userRoles)) {
    buckets.push(listIncomingLotEditApprovalHistory(prisma, companyId));
  }

  const groups = await Promise.all(buckets);
  return groups
    .flat()
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, limit);
}

async function listPendingQuotationApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.QUOTATION,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const rows = await prisma.quotation.findMany({
    where: {
      companyId,
      id: { in: approvals.map((row) => row.moduleId) },
      items: { some: { approvalStatus: ItemApprovalStatus.PENDING } },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
      items: {
        where: { approvalStatus: ItemApprovalStatus.PENDING },
        select: { id: true },
      },
    },
  });
  const quotationMap = new Map(rows.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const row = quotationMap.get(approval.moduleId);
    if (!row) return [];
    const pendingCount = row.items.length;
    return [
      {
        id: `QUOTATION_PRICE:${row.id}`,
        type: "QUOTATION_PRICE" as const,
        moduleId: row.id,
        documentNo: row.quotationNo,
        subjectName: row.customer.customerName,
        reason:
          pendingCount === 1
            ? "Below-minimum price on 1 line"
            : `Below-minimum price on ${pendingCount} lines`,
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/quotations/${row.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingBookingApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.BOOKING,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: ProformaInvoiceStatus.PENDING_BOOKING,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
    },
  });
  const piMap = new Map(rows.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const row = piMap.get(approval.moduleId);
    if (!row) return [];
    return [
      {
        id: `PI_BOOKING:${row.id}`,
        type: "PI_BOOKING" as const,
        moduleId: row.id,
        documentNo: row.piNo,
        subjectName: row.customer.customerName,
        reason:
          approval.remarks?.trim() || "Stock booking approval requested",
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/proforma-invoices/${row.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingDispatchTodayApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const pis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
    },
  });
  const piMap = new Map(pis.map((pi) => [pi.id, pi]));

  return approvals.flatMap((approval) => {
    const pi = piMap.get(approval.moduleId);
    if (!pi) return [];
    return [
      {
        id: `DISPATCH_TODAY:${pi.id}`,
        type: "DISPATCH_TODAY" as const,
        moduleId: pi.id,
        documentNo: pi.piNo,
        subjectName: pi.customer.customerName,
        reason: approval.remarks?.trim() || "Dispatch today approval requested",
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/proforma-invoices/${pi.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingCrossCompanyTransferApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const plans = await prisma.piCrossCompanyTransferPlan.findMany({
    where: {
      toCompanyId: companyId,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      pi: {
        include: {
          customer: { select: { customerName: true } },
        },
      },
      fromCompany: { select: { code: true } },
    },
  });
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));

  // Hide standalone transfer rows when a DISPATCH_TODAY approval already
  // covers the same PI (single combined message path).
  const piIds = [...new Set(plans.map((plan) => plan.piId))];
  const coveredByDispatchToday =
    piIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.approvalRequest.findMany({
              where: {
                moduleType: ApprovalModuleType.DISPATCH_TODAY,
                moduleId: { in: piIds },
                status: ApprovalRequestStatus.PENDING,
              },
              select: { moduleId: true },
            })
          ).map((row) => row.moduleId),
        );

  return approvals.flatMap((approval) => {
    const plan = planMap.get(approval.moduleId);
    if (!plan) return [];
    if (coveredByDispatchToday.has(plan.piId)) return [];
    return [
      {
        id: `CROSS_COMPANY_TRANSFER:${plan.id}`,
        type: "CROSS_COMPANY_TRANSFER" as const,
        moduleId: plan.id,
        documentNo: plan.pi.piNo,
        subjectName: plan.pi.customer.customerName,
        reason:
          approval.remarks?.trim() ||
          `Transfer shortfall stock from ${plan.fromCompany.code}`,
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/proforma-invoices/${plan.piId}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingDcCancelApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.DC_CANCEL,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const rows = await prisma.dispatch.findMany({
    where: {
      companyId,
      status: DispatchStatus.CANCEL_PENDING,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      customer: { select: { customerName: true } },
      createdBy: { select: { name: true } },
    },
  });
  const dispatchMap = new Map(rows.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const row = dispatchMap.get(approval.moduleId);
    if (!row) return [];
    return [
      {
        id: `DC_CANCEL:${row.id}`,
        type: "DC_CANCEL" as const,
        moduleId: row.id,
        documentNo: row.dcNo,
        subjectName: row.customer.customerName,
        reason: "Delivery challan cancellation requested",
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/inventory/dispatches/${row.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingPiCancelApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.PI_CANCEL,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: ProformaInvoiceStatus.CANCEL_PENDING,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
    },
  });
  const piMap = new Map(rows.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const row = piMap.get(approval.moduleId);
    if (!row) return [];
    return [
      {
        id: `PI_CANCEL:${row.id}`,
        type: "PI_CANCEL" as const,
        moduleId: row.id,
        documentNo: row.piNo,
        subjectName: row.customer.customerName,
        reason: "Proforma invoice cancellation requested",
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/proforma-invoices/${row.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingPiCreditSmApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  return listPendingPiCreditApprovals(prisma, companyId, {
    moduleType: ApprovalModuleType.PI_CREDIT,
    type: "PI_CREDIT",
    reasonFallback: "Credit dispatch — Sales Manager approval",
  });
}

async function listPendingPiCreditAccountsApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  return listPendingPiCreditApprovals(prisma, companyId, {
    moduleType: ApprovalModuleType.PI_CREDIT_ACCOUNTS,
    type: "PI_CREDIT_ACCOUNTS",
    reasonFallback: "Credit dispatch — Accounts approval",
  });
}

async function listPendingPiCreditApprovals(
  prisma: PrismaClient,
  companyId: string,
  options: {
    moduleType: typeof ApprovalModuleType.PI_CREDIT | typeof ApprovalModuleType.PI_CREDIT_ACCOUNTS;
    type: "PI_CREDIT" | "PI_CREDIT_ACCOUNTS";
    reasonFallback: string;
  },
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: options.moduleType,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (approvals.length === 0) return [];

  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      id: { in: approvals.map((row) => row.moduleId) },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
    },
  });
  const piMap = new Map(rows.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const row = piMap.get(approval.moduleId);
    if (!row) return [];
    return [
      {
        id: `${options.type}:${row.id}`,
        type: options.type,
        moduleId: row.id,
        documentNo: row.piNo,
        subjectName: row.customer.customerName,
        reason: approval.remarks?.trim() || options.reasonFallback,
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/sales/proforma-invoices/${row.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingProposalApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const rows = await prisma.projectProposal.findMany({
    where: { companyId, status: ProjectProposalStatus.PENDING_APPROVAL },
    include: {
      salesUser: { select: { name: true } },
      revisions: {
        select: {
          revisionNo: true,
          customerName: true,
          discountAmount: true,
        },
      },
      approvals: {
        where: { status: ProjectProposalApprovalStatus.PENDING },
        include: { requestedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => {
    const revision =
      row.revisions.find((entry) => entry.revisionNo === row.currentRevisionNo) ??
      row.revisions[row.revisions.length - 1];
    const pending = row.approvals[0];
    const discount = Number(revision?.discountAmount ?? pending?.discountAmount ?? 0);
    return {
      id: `PROJECT_PROPOSAL:${row.id}`,
      type: "PROJECT_PROPOSAL" as const,
      moduleId: row.id,
      documentNo: row.proposalNo,
      subjectName: revision?.customerName ?? "—",
      reason: `Discount ${formatInr(discount)} requires approval`,
      requestedByName: pending?.requestedBy.name ?? row.salesUser.name,
      requestedAt: toIso(pending?.createdAt ?? row.updatedAt),
      href: `/projects/proposals/${row.id}`,
      canReject: true,
    };
  });
}

async function listPendingProjectMaterialApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.PROJECT_MATERIAL,
      status: ApprovalRequestStatus.PENDING,
    },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (approvals.length === 0) return [];

  const projectIds = approvals.map((row) => row.moduleId);
  const projects = await prisma.project.findMany({
    where: { companyId, id: { in: projectIds } },
    include: { proposal: { select: { proposalNo: true } } },
  });
  const projectMap = new Map(projects.map((row) => [row.id, row]));

  return approvals.flatMap((approval) => {
    const project = projectMap.get(approval.moduleId);
    if (!project) return [];

    let lineCount = 0;
    try {
      const payload = JSON.parse(approval.remarks ?? "{}") as { lineIds?: string[] };
      lineCount = payload.lineIds?.length ?? 0;
    } catch {
      lineCount = 0;
    }

    return [
      {
        id: `PROJECT_MATERIAL:${approval.id}`,
        type: "PROJECT_MATERIAL" as const,
        moduleId: project.id,
        documentNo: project.projectNo,
        subjectName: `${project.customerName} · ${project.proposal.proposalNo}`,
        reason: `${lineCount} line(s) changed or added for material assignment`,
        requestedByName: approval.requestedBy.name,
        requestedAt: toIso(approval.createdAt),
        href: `/projects/execution/${project.id}`,
        canReject: true,
      },
    ];
  });
}

async function listPendingOpeningStockApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const rows = await prisma.inventoryOpeningAudit.findMany({
    where: { companyId, status: OpeningAuditStatus.SUBMITTED },
    include: {
      warehouse: { select: { name: true } },
      submittedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return rows.map((row) => ({
    id: `OPENING_STOCK:${row.id}`,
    type: "OPENING_STOCK" as const,
    moduleId: row.id,
    documentNo: row.auditNumber,
    subjectName: row.warehouse.name,
    reason: "Opening stock audit submitted for approval",
    requestedByName: row.submittedBy?.name ?? row.createdBy.name,
    requestedAt: toIso(row.submittedAt ?? row.updatedAt),
    href: `/inventory/audits/opening/${row.id}`,
    canReject: true,
  }));
}

async function listPendingPanelDamageApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const rows = await prisma.inventoryDamageReport.findMany({
    where: { companyId, status: DamageReportStatus.PENDING },
    include: {
      product: { select: { displayName: true } },
      warehouse: { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: `PANEL_DAMAGE:${row.id}`,
    type: "PANEL_DAMAGE" as const,
    moduleId: row.id,
    documentNo: row.serialNumber,
    subjectName: `${row.product.displayName} · ${row.warehouse.name}`,
    reason: `${DAMAGE_CATEGORY_LABELS[row.category]}: ${row.reason}`,
    requestedByName: row.requestedBy.name,
    requestedAt: toIso(row.createdAt),
    href: `/inventory/damaged?highlight=${row.id}`,
    canReject: true,
  }));
}

async function listPendingIncomingLotEditApprovals(
  prisma: PrismaClient,
  companyId: string,
): Promise<PendingApprovalItem[]> {
  const rows = await prisma.incomingLotChangeRequest.findMany({
    where: { companyId, status: IncomingLotChangeStatus.PENDING },
    include: {
      lot: { select: { lotNumber: true, warehouse: { select: { name: true } } } },
      previousProduct: { select: { displayName: true } },
      proposedProduct: { select: { displayName: true } },
      requestedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const parts: string[] = [];
    if (row.previousProductId !== row.proposedProductId) {
      parts.push(
        `Product: ${row.previousProduct.displayName} → ${row.proposedProduct.displayName}`,
      );
    }
    if (Number(row.previousQuantity) !== Number(row.proposedQuantity)) {
      parts.push(`Qty: ${Number(row.previousQuantity)} → ${Number(row.proposedQuantity)}`);
    }
    if (row.previousPurchaseInvoiceNo !== row.proposedPurchaseInvoiceNo) {
      parts.push(
        `Invoice: ${row.previousPurchaseInvoiceNo} → ${row.proposedPurchaseInvoiceNo}`,
      );
    }

    return {
      id: `INCOMING_LOT_EDIT:${row.id}`,
      type: "INCOMING_LOT_EDIT" as const,
      moduleId: row.id,
      documentNo: row.lot.lotNumber,
      subjectName: `${row.proposedProduct.displayName} · ${row.lot.warehouse.name}`,
      reason: parts.join(" · ") || "Receive-time lot edit",
      requestedByName: row.requestedBy.name,
      requestedAt: toIso(row.createdAt),
      href: `/inventory/incoming/${row.lotId}`,
      canReject: true,
    };
  });
}

async function listQuotationApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(prisma, companyId, ApprovalModuleType.QUOTATION, "QUOTATION_PRICE");
}

async function listBookingApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(prisma, companyId, ApprovalModuleType.BOOKING, "PI_BOOKING");
}

async function listDispatchTodayApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(
    prisma,
    companyId,
    ApprovalModuleType.DISPATCH_TODAY,
    "DISPATCH_TODAY",
  );
}

async function listCrossCompanyTransferApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(
    prisma,
    companyId,
    ApprovalModuleType.CROSS_COMPANY_TRANSFER,
    "CROSS_COMPANY_TRANSFER",
  );
}

async function listDcCancelApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(prisma, companyId, ApprovalModuleType.DC_CANCEL, "DC_CANCEL");
}

async function listPiCancelApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(prisma, companyId, ApprovalModuleType.PI_CANCEL, "PI_CANCEL");
}

async function listPiCreditApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  const [sm, accounts] = await Promise.all([
    listApprovalRequestHistory(prisma, companyId, ApprovalModuleType.PI_CREDIT, "PI_CREDIT"),
    listApprovalRequestHistory(
      prisma,
      companyId,
      ApprovalModuleType.PI_CREDIT_ACCOUNTS,
      "PI_CREDIT_ACCOUNTS",
    ),
  ]);
  return [...sm, ...accounts];
}

async function listApprovalRequestHistory(
  prisma: PrismaClient,
  companyId: string,
  moduleType: ApprovalModuleType,
  type: ApprovalType,
): Promise<ApprovalHistoryItem[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      moduleType,
      status: { in: [ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED] },
    },
    include: {
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  if (approvals.length === 0) return [];

  const moduleIds = approvals.map((row) => row.moduleId);
  const meta = await loadModuleMeta(prisma, companyId, moduleType, moduleIds);

  return approvals.flatMap((approval) => {
    const info = meta.get(approval.moduleId);
    if (!info) return [];
    return [
      {
        id: `${type}:${approval.id}`,
        type,
        moduleId: approval.moduleId,
        documentNo: info.documentNo,
        subjectName: info.subjectName,
        reason: approval.remarks?.trim() || info.reason,
        decision: approval.status === ApprovalRequestStatus.APPROVED ? "APPROVED" : "REJECTED",
        requestedByName: approval.requestedBy.name,
        decidedByName: approval.approvedBy?.name ?? null,
        requestedAt: toIso(approval.createdAt),
        decidedAt: toIso(approval.updatedAt),
        href: info.href,
      },
    ];
  });
}

async function listProposalApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  const rows = await prisma.projectProposalApproval.findMany({
    where: {
      status: {
        in: [ProjectProposalApprovalStatus.APPROVED, ProjectProposalApprovalStatus.REJECTED],
      },
      proposal: { companyId },
    },
    include: {
      requestedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      proposal: { select: { id: true, proposalNo: true } },
      revision: { select: { customerName: true, discountAmount: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  return rows.map((row) => ({
    id: `PROJECT_PROPOSAL:${row.id}`,
    type: "PROJECT_PROPOSAL" as const,
    moduleId: row.proposal.id,
    documentNo: row.proposal.proposalNo,
    subjectName: row.revision.customerName,
    reason: `Discount ${formatInr(Number(row.discountAmount))}`,
    decision: row.status === ProjectProposalApprovalStatus.APPROVED ? "APPROVED" : "REJECTED",
    requestedByName: row.requestedBy.name,
    decidedByName: row.decidedBy?.name ?? null,
    requestedAt: toIso(row.createdAt),
    decidedAt: toIso(row.updatedAt),
    href: `/projects/proposals/${row.proposal.id}`,
  }));
}

async function listProjectMaterialApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(
    prisma,
    companyId,
    ApprovalModuleType.PROJECT_MATERIAL,
    "PROJECT_MATERIAL",
  );
}

async function listOpeningStockApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  const [approved, rejectLogs] = await Promise.all([
    prisma.inventoryOpeningAudit.findMany({
      where: { companyId, status: OpeningAuditStatus.APPROVED },
      include: {
        warehouse: { select: { name: true } },
        submittedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { approvedAt: "desc" },
      take: 80,
    }),
    prisma.auditLog.findMany({
      where: {
        companyId,
        tableName: "inventory_opening_audits",
        action: "UPDATE",
      },
      include: { performer: { select: { name: true } } },
      orderBy: { performedAt: "desc" },
      take: 80,
    }),
  ]);

  const approvedItems: ApprovalHistoryItem[] = approved.map((row) => ({
    id: `OPENING_STOCK:${row.id}`,
    type: "OPENING_STOCK" as const,
    moduleId: row.id,
    documentNo: row.auditNumber,
    subjectName: row.warehouse.name,
    reason: "Opening stock audit",
    decision: "APPROVED" as const,
    requestedByName: row.submittedBy?.name ?? row.createdBy.name,
    decidedByName: row.approvedBy?.name ?? null,
    requestedAt: toIso(row.submittedAt ?? row.createdAt),
    decidedAt: toIso(row.approvedAt ?? row.updatedAt),
    href: `/inventory/audits/opening/${row.id}`,
  }));

  const auditIds = [
    ...new Set(
      rejectLogs
        .filter((log) => {
          const value = log.newValue as { decision?: string } | null;
          return value?.decision === "REJECTED";
        })
        .map((log) => log.recordId),
    ),
  ];
  const audits =
    auditIds.length === 0
      ? []
      : await prisma.inventoryOpeningAudit.findMany({
          where: { companyId, id: { in: auditIds } },
          include: {
            warehouse: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        });
  const auditMap = new Map(audits.map((row) => [row.id, row]));

  const rejectedItems: ApprovalHistoryItem[] = rejectLogs.flatMap((log) => {
    const value = log.newValue as { decision?: string; reason?: string } | null;
    if (value?.decision !== "REJECTED") return [];
    const audit = auditMap.get(log.recordId);
    if (!audit) return [];
    return [
      {
        id: `OPENING_STOCK_REJECT:${log.id}`,
        type: "OPENING_STOCK" as const,
        moduleId: audit.id,
        documentNo: audit.auditNumber,
        subjectName: audit.warehouse.name,
        reason: value.reason ? `Rejected: ${value.reason}` : "Opening stock audit rejected",
        decision: "REJECTED" as const,
        requestedByName: audit.createdBy.name,
        decidedByName: log.performer?.name ?? null,
        requestedAt: toIso(log.performedAt),
        decidedAt: toIso(log.performedAt),
        href: `/inventory/audits/opening/${audit.id}`,
      },
    ];
  });

  return [...approvedItems, ...rejectedItems];
}

async function listPanelDamageApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(
    prisma,
    companyId,
    ApprovalModuleType.PANEL_DAMAGE,
    "PANEL_DAMAGE",
  );
}

async function listIncomingLotEditApprovalHistory(
  prisma: PrismaClient,
  companyId: string,
): Promise<ApprovalHistoryItem[]> {
  return listApprovalRequestHistory(
    prisma,
    companyId,
    ApprovalModuleType.INCOMING_LOT_EDIT,
    "INCOMING_LOT_EDIT",
  );
}

async function loadModuleMeta(
  prisma: PrismaClient,
  companyId: string,
  moduleType: ApprovalModuleType,
  moduleIds: string[],
): Promise<Map<string, { documentNo: string; subjectName: string; reason: string; href: string }>> {
  const map = new Map<
    string,
    { documentNo: string; subjectName: string; reason: string; href: string }
  >();

  if (moduleType === ApprovalModuleType.QUOTATION) {
    const rows = await prisma.quotation.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: { customer: { select: { customerName: true } } },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.quotationNo,
        subjectName: row.customer.customerName,
        reason: "Below-minimum pricing",
        href: `/sales/quotations/${row.id}`,
      });
    }
  } else if (
    moduleType === ApprovalModuleType.BOOKING ||
    moduleType === ApprovalModuleType.DISPATCH_TODAY ||
    moduleType === ApprovalModuleType.PI_CANCEL ||
    moduleType === ApprovalModuleType.PI_CREDIT ||
    moduleType === ApprovalModuleType.PI_CREDIT_ACCOUNTS
  ) {
    const rows = await prisma.proformaInvoice.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: { customer: { select: { customerName: true } } },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.piNo,
        subjectName: row.customer.customerName,
        reason:
          moduleType === ApprovalModuleType.BOOKING
            ? "Stock booking"
            : moduleType === ApprovalModuleType.DISPATCH_TODAY
              ? "Dispatch today approval"
              : moduleType === ApprovalModuleType.PI_CREDIT
                ? "PI credit (Sales Manager)"
                : moduleType === ApprovalModuleType.PI_CREDIT_ACCOUNTS
                  ? "PI credit (Accounts)"
                  : "PI cancellation",
        href: `/sales/proforma-invoices/${row.id}`,
      });
    }
  } else if (moduleType === ApprovalModuleType.DC_CANCEL) {
    const rows = await prisma.dispatch.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: { customer: { select: { customerName: true } } },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.dcNo,
        subjectName: row.customer.customerName,
        reason: "DC cancellation",
        href: `/inventory/dispatches/${row.id}`,
      });
    }
  } else if (moduleType === ApprovalModuleType.CROSS_COMPANY_TRANSFER) {
    const rows = await prisma.piCrossCompanyTransferPlan.findMany({
      where: { toCompanyId: companyId, id: { in: moduleIds } },
      include: {
        pi: { include: { customer: { select: { customerName: true } } } },
        fromCompany: { select: { code: true } },
      },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.pi.piNo,
        subjectName: row.pi.customer.customerName,
        reason: `Cross-company transfer from ${row.fromCompany.code}`,
        href: `/sales/proforma-invoices/${row.piId}`,
      });
    }
  } else if (moduleType === ApprovalModuleType.PANEL_DAMAGE) {
    const rows = await prisma.inventoryDamageReport.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: {
        product: { select: { displayName: true } },
        warehouse: { select: { name: true } },
      },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.serialNumber,
        subjectName: `${row.product.displayName} · ${row.warehouse.name}`,
        reason: `${DAMAGE_CATEGORY_LABELS[row.category]}: ${row.reason}`,
        href: `/inventory/damaged?highlight=${row.id}`,
      });
    }
  } else if (moduleType === ApprovalModuleType.INCOMING_LOT_EDIT) {
    const rows = await prisma.incomingLotChangeRequest.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: {
        lot: { select: { lotNumber: true, warehouse: { select: { name: true } } } },
        proposedProduct: { select: { displayName: true } },
      },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.lot.lotNumber,
        subjectName: `${row.proposedProduct.displayName} · ${row.lot.warehouse.name}`,
        reason: "Receive-time lot edit",
        href: `/inventory/incoming/${row.lotId}`,
      });
    }
  } else if (moduleType === ApprovalModuleType.PROJECT_MATERIAL) {
    const rows = await prisma.project.findMany({
      where: { companyId, id: { in: moduleIds } },
      include: { proposal: { select: { proposalNo: true } } },
    });
    for (const row of rows) {
      map.set(row.id, {
        documentNo: row.projectNo,
        subjectName: `${row.customerName} · ${row.proposal.proposalNo}`,
        reason: "Project material assignment",
        href: `/projects/execution/${row.id}`,
      });
    }
  }

  return map;
}
