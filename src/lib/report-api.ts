import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { buildExcelBuffer, exportFilename, type ExportColumn } from "@/lib/report-export";
import { generateTabularReportPdf, type PdfColumn } from "@/lib/report-pdf";
import { operationalCompanies } from "@/lib/learning/mode";
import { isSuperAdmin } from "@/lib/rbac";
import { restrictSalesUserId, restrictSalesUserIds } from "@/lib/report-permissions";
import { z } from "zod";
import { requireActiveCompany } from "@/lib/session";
import { reportSearchSchema } from "@/lib/validations";

export function reportError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function parseCommaSeparatedUuids(
  raw: string | undefined,
  fieldLabel: string,
): { ids?: string[]; error?: ReturnType<typeof reportError> } {
  if (!raw) return {};
  const ids = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!z.string().uuid().safeParse(id).success) {
      return { error: reportError("VALIDATION_ERROR", `Invalid ${fieldLabel}.`, 400) };
    }
  }
  return { ids: ids.length ? ids : undefined };
}

export async function resolveReportCompanyIds(
  session: Session,
  requestedCompanyIds: string[] | undefined,
  prisma: PrismaClient,
): Promise<string[] | ReturnType<typeof reportError>> {
  const permitted = isSuperAdmin(session.user.roles)
    ? (
        await prisma.company.findMany({
          where: { isActive: true, isPractice: false },
          select: { id: true },
        })
      ).map((company) => company.id)
    : operationalCompanies(session.user.companies ?? []).map((company) => company.id);

  if (permitted.length === 0) {
    return reportError("COMPANY_REQUIRED", "No company access.", 403);
  }

  const selected = requestedCompanyIds?.length ? requestedCompanyIds : permitted;
  for (const id of selected) {
    if (!permitted.includes(id)) {
      return reportError(
        "FORBIDDEN",
        "You cannot view one or more selected companies.",
        403,
      );
    }
  }
  return selected;
}

export async function parseReportRequest(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return { error: reportError("AUTH_REQUIRED", "Please login to continue.", 401) };
  }

  const companyId = requireActiveCompany(session);
  const { searchParams } = new URL(request.url);
  const parsed = reportSearchSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return {
      error: reportError("VALIDATION_ERROR", "Invalid report filters.", 400),
    };
  }

  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    parsed.data.salesUserId,
  );

  let salesUserIds: string[] | undefined;
  const parsedSalesUserIds = parseCommaSeparatedUuids(
    parsed.data.salesUserIds,
    "sales executive ids",
  );
  if (parsedSalesUserIds.error) {
    return { error: parsedSalesUserIds.error };
  }
  salesUserIds = parsedSalesUserIds.ids;

  let companyIds: string[] | undefined;
  const parsedCompanyIds = parseCommaSeparatedUuids(parsed.data.companyIds, "company ids");
  if (parsedCompanyIds.error) {
    return { error: parsedCompanyIds.error };
  }
  companyIds = parsedCompanyIds.ids;

  const restrictedSalesUserIds = restrictSalesUserIds(
    session.user.roles,
    session.user.id,
    salesUserIds,
  );

  return {
    session,
    companyId,
    filters: {
      ...parsed.data,
      salesUserId,
      salesUserIds: restrictedSalesUserIds,
      companyIds,
    },
    format: parsed.data.format ?? "json",
  };
}

export function respondWithReport<T extends Record<string, unknown>>(input: {
  reportKey: string;
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ExportColumn<T>[];
  pdfColumns: PdfColumn[];
  format: string;
  toPdfRow: (row: T) => string[];
}) {
  if (input.format === "xlsx") {
    const buffer = buildExcelBuffer(input.rows, input.title, input.columns);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(input.reportKey, "xlsx")}"`,
      },
    });
  }

  if (input.format === "pdf") {
    return generateTabularReportPdf({
      title: input.title,
      subtitle: input.subtitle,
      columns: input.pdfColumns,
      rows: input.rows.map(input.toPdfRow),
    }).then((buffer) =>
      new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${exportFilename(input.reportKey, "pdf")}"`,
        },
      }),
    );
  }

  return NextResponse.json(input.rows);
}

export type ReportSession = Session;
