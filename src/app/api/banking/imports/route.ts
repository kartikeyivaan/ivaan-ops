import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listBankStatementImports,
  serializeBankImport,
} from "@/lib/banking-query-service";
import { canViewBankImportHistory } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewBankImportHistory(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const rows = await listBankStatementImports(prisma, companyId);
  return NextResponse.json({ items: rows.map(serializeBankImport) });
}
