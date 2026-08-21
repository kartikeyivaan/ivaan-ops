import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listBankAccounts,
  listBankAccountsForCompanies,
  serializeBankAccount,
} from "@/lib/bank-account-service";
import {
  cancelBankStatementImport,
  confirmBankStatementImport,
  previewBankStatementUpload,
} from "@/lib/bank-statement-import-service";
import { isAllowedBankStatementFilename } from "@/lib/bank-statement-temp";
import { canUploadBankStatements } from "@/lib/banking-permissions";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";

export const runtime = "nodejs";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

const MAX_BYTES = 15 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (!session?.user || !canUploadBankStatements(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const sessionCompanyIds = getSessionCompanyIds(session);
  const accounts = isSuperAdmin(session.user.roles)
    ? await prisma.bankAccount.findMany({
        where: { isActive: true },
        include: { company: { select: { id: true, code: true, name: true } } },
        orderBy: [{ bankName: "asc" }, { accountName: "asc" }],
      })
    : sessionCompanyIds.length > 0
      ? await listBankAccountsForCompanies(prisma, sessionCompanyIds, {
          includeInactive: false,
        })
      : await listBankAccounts(prisma, requireActiveCompany(session), {
          includeInactive: false,
        });

  return NextResponse.json({
    accounts: accounts.map(serializeBankAccount),
    allowedExtensions: [".xlsx", ".xls", ".csv", ".tsv"],
    maxBytes: MAX_BYTES,
  });
}

/** Upload → parse → duplicate analysis; optional autoConfirm imports NEW rows. Temp file always deleted. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUploadBankStatements(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const sessionCompanyIds = getSessionCompanyIds(session);
  const fallbackCompanyId = (() => {
    try {
      return requireActiveCompany(session);
    } catch {
      return sessionCompanyIds[0] ?? null;
    }
  })();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart form data.", 400, "INVALID_FORM");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return error("Statement file is required.", 400, "FILE_REQUIRED");
  }

  const originalFilename = file.name || "statement.xlsx";
  if (!isAllowedBankStatementFilename(originalFilename)) {
    return error(
      "Unsupported file type. Upload .xlsx, .xls, .csv, or .tsv.",
      400,
      "UNSUPPORTED_FILE_TYPE",
    );
  }

  if (file.size <= 0) {
    return error("Uploaded file is empty.", 400, "EMPTY_FILE");
  }
  if (file.size > MAX_BYTES) {
    return error("File exceeds the 15 MB upload limit.", 400, "FILE_TOO_LARGE");
  }

  const bankAccountIdRaw = form.get("bankAccountId");
  const bankAccountId =
    typeof bankAccountIdRaw === "string" && bankAccountIdRaw.trim()
      ? bankAccountIdRaw.trim()
      : null;

  const autoConfirmRaw = form.get("autoConfirm");
  const autoConfirm =
    autoConfirmRaw === "1" ||
    autoConfirmRaw === "true" ||
    (typeof autoConfirmRaw === "string" && autoConfirmRaw.toLowerCase() === "yes");

  let scopedCompanyId: string | null = fallbackCompanyId;

  if (bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, isActive: true },
      select: { id: true, companyId: true },
    });
    if (
      !account ||
      !assertCompanyAccess(session.user.roles, sessionCompanyIds, account.companyId)
    ) {
      return error("Bank account not found or not accessible.", 400, "BANK_ACCOUNT_INVALID");
    }
    scopedCompanyId = account.companyId;
  }

  const contents = Buffer.from(await file.arrayBuffer());

  try {
    const result = await previewBankStatementUpload(prisma, {
      originalFilename,
      contents,
      uploadedById: session.user.id,
      companyId: bankAccountId ? scopedCompanyId : null,
      bankAccountId,
    });

    const { tempPathWas: _tempPathWas, ...safe } = result;
    void _tempPathWas;

    if (result.processingStatus === "FAILED") {
      return NextResponse.json(
        {
          ...safe,
          confirmed: false,
          message: result.errorMessage ?? "Statement analysis failed. Original upload file was deleted.",
        },
        { status: 422 },
      );
    }

    const mappedCompanyId = result.preview?.company.id ?? null;
    if (
      !mappedCompanyId ||
      !assertCompanyAccess(session.user.roles, sessionCompanyIds, mappedCompanyId)
    ) {
      if (result.processingStatus === "PREVIEWED" && result.importId) {
        try {
          await cancelBankStatementImport(
            prisma,
            result.importId,
            session.user.id,
            mappedCompanyId ?? scopedCompanyId ?? "",
          );
        } catch {
          // Best-effort cancel if access denied after mapping.
        }
      }
      return error(
        "Mapped bank account belongs to a firm you cannot access.",
        403,
        "FORBIDDEN_COMPANY",
      );
    }

    if (autoConfirm && result.processingStatus === "PREVIEWED") {
      const confirmed = await confirmBankStatementImport(
        prisma,
        result.importId,
        session.user.id,
        mappedCompanyId,
      );
      return NextResponse.json({
        ...safe,
        processingStatus: confirmed.processingStatus,
        newTransactions: confirmed.newTransactions,
        confirmed: true,
        exactMatchesSkipped: confirmed.exactMatchesSkipped,
        mismatchesRecorded: confirmed.mismatchesRecorded,
        balanceIssuesRecorded: confirmed.balanceIssuesRecorded,
        message: `Imported ${confirmed.newTransactions} new transaction(s) into ${result.preview?.company.code ?? "firm"} · ${result.preview?.bankAccount.accountNumberMasked ?? "account"}. Exact matches skipped; mismatches were not overwritten.`,
      });
    }

    return NextResponse.json({
      ...safe,
      confirmed: false,
      message:
        "Import analysis ready. Review and confirm to import new transactions only.",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
      return error("Unsupported file type.", 400, "UNSUPPORTED_FILE_TYPE");
    }
    throw err;
  }
}
