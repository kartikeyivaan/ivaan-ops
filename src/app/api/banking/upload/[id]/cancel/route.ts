import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelBankStatementImport } from "@/lib/bank-statement-import-service";
import { canUploadBankStatements } from "@/lib/banking-permissions";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";

export const runtime = "nodejs";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !canUploadBankStatements(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const { id } = await params;

  const importRow = await prisma.bankStatementImport.findUnique({
    where: { id },
    select: { bankAccountId: true },
  });
  if (!importRow) {
    return error("Import not found.", 404, "NOT_FOUND");
  }

  let companyId: string | null = null;
  if (importRow.bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: importRow.bankAccountId },
      select: { companyId: true },
    });
    if (
      !account ||
      !assertCompanyAccess(session.user.roles, getSessionCompanyIds(session), account.companyId)
    ) {
      return error("Forbidden.", 403, "FORBIDDEN");
    }
    companyId = account.companyId;
  }

  try {
    const result = await cancelBankStatementImport(
      prisma,
      id,
      session.user.id,
      companyId ?? getSessionCompanyIds(session)[0] ?? "",
    );
    return NextResponse.json({
      ...result,
      message: "Import cancelled. No transactions were inserted.",
    });
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    switch (err.message) {
      case "NOT_FOUND":
        return error("Import not found.", 404, "NOT_FOUND");
      case "INVALID_STATUS":
        return error("Import is not awaiting confirmation.", 409, "INVALID_STATUS");
      case "FORBIDDEN_COMPANY":
        return error("Forbidden.", 403, "FORBIDDEN");
      default:
        throw err;
    }
  }
}
