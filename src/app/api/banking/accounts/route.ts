import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createBankAccount,
  listBankAccounts,
  serializeBankAccount,
} from "@/lib/bank-account-service";
import { canManageBankAccounts } from "@/lib/banking-permissions";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";
import { bankAccountCreateSchema } from "@/lib/validations";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageBankAccounts(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive") === "1";

  const accounts = await listBankAccounts(prisma, companyId, { includeInactive });
  return NextResponse.json({
    items: accounts.map(serializeBankAccount),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageBankAccounts(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const body = await request.json();
  const parsed = bankAccountCreateSchema.safeParse(body);
  if (!parsed.success) {
    return error("Invalid bank account data.", 400, "VALIDATION_ERROR");
  }

  const activeCompanyId = requireActiveCompany(session);
  if (parsed.data.companyId !== activeCompanyId) {
    return error("Company does not match the active company.", 400, "COMPANY_MISMATCH");
  }

  if (
    !assertCompanyAccess(
      session.user.roles,
      getSessionCompanyIds(session),
      parsed.data.companyId,
    )
  ) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  try {
    const account = await createBankAccount(prisma, parsed.data, session.user.id);
    return NextResponse.json(serializeBankAccount(account), { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "ACCOUNT_NUMBER_EXISTS") {
      return error("An account with this number already exists.", 409, "ACCOUNT_NUMBER_EXISTS");
    }
    throw err;
  }
}
