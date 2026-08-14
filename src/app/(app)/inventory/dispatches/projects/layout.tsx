import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveSessionCompany, isProjectsCompany } from "@/lib/company-scope";

export default async function ProjectDispatchesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const activeCompany = getActiveSessionCompany(session);
  if (!activeCompany || !isProjectsCompany(activeCompany)) {
    redirect("/inventory/dispatches");
  }

  return children;
}
