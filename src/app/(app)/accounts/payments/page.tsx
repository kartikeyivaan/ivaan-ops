import { redirect } from "next/navigation";
import { AccountsPaymentsList } from "@/components/accounts/accounts-payments-list";
import { canViewPiPayments } from "@/lib/accounts-permissions";
import { auth } from "@/lib/auth";

export default async function AccountsPaymentsPage() {
  const session = await auth();
  if (!session?.user || !canViewPiPayments(session.user.roles)) {
    redirect("/dashboard");
  }

  return <AccountsPaymentsList />;
}
