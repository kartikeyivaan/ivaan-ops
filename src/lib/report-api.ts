import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { buildExcelBuffer, exportFilename, type ExportColumn } from "@/lib/report-export";
import { generateTabularReportPdf, type PdfColumn } from "@/lib/report-pdf";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";
import { reportSearchSchema } from "@/lib/validations";

export function reportError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
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

  return {
    session,
    companyId,
    filters: { ...parsed.data, salesUserId },
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
