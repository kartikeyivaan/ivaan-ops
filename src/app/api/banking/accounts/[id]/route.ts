import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  serializeBankAccount,
  updateBankAccount,
} from "@/lib/bank-account-service";
import { canManageBankAccounts } from "@/lib/banking-permissions";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";
import { bankAccountUpdateSchema } from "@/lib/validations";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !canManageBankAccounts(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const { id } = await params;
  const existing = await prisma.bankAccount.findUnique({ where: { id } });
  if (!existing) {
    return error("Bank account not found.", 404, "NOT_FOUND");
  }

  if (
    !assertCompanyAccess(
      session.user.roles,
      getSessionCompanyIds(session),
      existing.companyId,
    )
  ) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const body = await request.json();
  const parsed = bankAccountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return error("Invalid bank account data.", 400, "VALIDATION_ERROR");
  }

  try {
    const account = await updateBankAccount(prisma, id, parsed.data, session.user.id);
    return NextResponse.json(serializeBankAccount(account));
  } catch (err) {
    if (err instanceof Error && err.message === "ACCOUNT_NUMBER_EXISTS") {
      return error("An account with this number already exists.", 409, "ACCOUNT_NUMBER_EXISTS");
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return error("Bank account not found.", 404, "NOT_FOUND");
    }
    throw err;
  }
}
