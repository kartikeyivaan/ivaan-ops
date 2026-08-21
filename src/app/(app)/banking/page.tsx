import { redirect } from "next/navigation";
import { BankingDashboard } from "@/components/banking/banking-dashboard";
import { auth } from "@/lib/auth";
import { canAccessBankingAdmin } from "@/lib/banking-permissions";

export default async function BankingHubPage() {
  const session = await auth();
  if (!session?.user || !canAccessBankingAdmin(session.user.roles)) {
    redirect("/dashboard");
  }

  return <BankingDashboard />;
}
