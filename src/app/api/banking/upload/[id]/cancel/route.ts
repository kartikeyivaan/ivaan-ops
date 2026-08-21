import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelBankStatementImport } from "@/lib/bank-statement-import-service";
import { canUploadBankStatements } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

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

  const companyId = requireActiveCompany(session);
  const { id } = await params;

  try {
    const result = await cancelBankStatementImport(prisma, id, session.user.id, companyId);
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
