import { redirect } from "next/navigation";
import { BankStatementUploadForm } from "@/components/banking/bank-statement-upload-form";
import { auth } from "@/lib/auth";
import { canUploadBankStatements } from "@/lib/banking-permissions";

export default async function BankStatementUploadPage() {
  const session = await auth();
  if (!session?.user || !canUploadBankStatements(session.user.roles)) {
    redirect("/dashboard");
  }

  return <BankStatementUploadForm />;
}
