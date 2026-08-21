import { redirect } from "next/navigation";
import { BankAccountsManager } from "@/components/banking/bank-accounts-manager";
import { auth } from "@/lib/auth";
import { listBankAccounts, serializeBankAccount } from "@/lib/bank-account-service";
import { canManageBankAccounts } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function BankAccountsPage() {
  const session = await auth();
  if (!session?.user || !canManageBankAccounts(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [accounts, company] = await Promise.all([
    listBankAccounts(prisma, companyId, { includeInactive: true }),
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <BankAccountsManager
      company={company}
      initialAccounts={accounts.map(serializeBankAccount)}
    />
  );
}
