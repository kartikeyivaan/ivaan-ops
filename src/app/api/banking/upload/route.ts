import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listBankAccounts, serializeBankAccount } from "@/lib/bank-account-service";
import { previewBankStatementUpload } from "@/lib/bank-statement-import-service";
import { isAllowedBankStatementFilename } from "@/lib/bank-statement-temp";
import { canUploadBankStatements } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

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

  const companyId = requireActiveCompany(session);
  const accounts = await listBankAccounts(prisma, companyId, { includeInactive: false });
  return NextResponse.json({
    accounts: accounts.map(serializeBankAccount),
    allowedExtensions: [".xlsx", ".xls", ".csv", ".tsv"],
    maxBytes: MAX_BYTES,
  });
}

/** Upload → parse → duplicate analysis preview. Temp file always deleted. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUploadBankStatements(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);

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

  if (bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, companyId, isActive: true },
      select: { id: true },
    });
    if (!account) {
      return error("Bank account not found for the active company.", 400, "BANK_ACCOUNT_INVALID");
    }
  }

  const contents = Buffer.from(await file.arrayBuffer());

  try {
    const result = await previewBankStatementUpload(prisma, {
      originalFilename,
      contents,
      uploadedById: session.user.id,
      companyId,
      bankAccountId,
    });

    const { tempPathWas: _tempPathWas, ...safe } = result;
    void _tempPathWas;

    const status =
      result.processingStatus === "PREVIEWED"
        ? 200
        : result.processingStatus === "FAILED"
          ? 422
          : 200;

    return NextResponse.json(
      {
        ...safe,
        message:
          result.processingStatus === "PREVIEWED"
            ? "Import analysis ready. Review and confirm to import new transactions only."
            : result.errorMessage ?? "Statement analysis failed. Original upload file was deleted.",
      },
      { status },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
      return error("Unsupported file type.", 400, "UNSUPPORTED_FILE_TYPE");
    }
    throw err;
  }
}
