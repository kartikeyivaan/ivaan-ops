import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { canViewService } from "@/lib/service-permissions";
import { getServiceCompany } from "@/lib/service-service";

export type ServicePageContext = {
  session: Session;
  companyId: string;
  roles: string[];
  userId: string;
};

/**
 * Server-side guard for Service pages. Ensures the user can view the Service
 * module and has access to the Ivaan (ISE) company it is bound to. Redirects to
 * the dashboard on any failure. Returns the resolved ISE company context.
 */
export async function requireServiceAccess(): Promise<ServicePageContext> {
  const session = await auth();
  if (!session?.user || !canViewService(session.user.roles)) {
    redirect("/dashboard");
  }

  const company = await getServiceCompany(prisma).catch(() => null);
  if (!company) {
    redirect("/dashboard");
  }

  const roles = session.user.roles;
  const companyIds = session.user.companies.map((entry) => entry.id);
  if (!isSuperAdmin(roles) && !companyIds.includes(company.id)) {
    redirect("/dashboard");
  }

  return {
    session,
    companyId: company.id,
    roles,
    userId: session.user.id,
  };
}
