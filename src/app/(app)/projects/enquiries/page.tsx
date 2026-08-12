import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageProjectEnquiries,
  canViewProjectEnquiries,
  restrictProjectEnquirySalesUserId,
} from "@/lib/project-enquiry-permissions";
import { listProjectEnquiries } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { ProjectEnquiriesList } from "@/components/project-enquiries/project-enquiries-list";

export default async function ProjectEnquiriesPage() {
  const session = await auth();
  if (!session?.user || !canViewProjectEnquiries(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const salesUserId = restrictProjectEnquirySalesUserId(session.user.roles, session.user.id, undefined);
  const enquiries = await listProjectEnquiries(prisma, companyId, { ...(salesUserId ? { salesUserId } : {}) });

  const showExecutiveFilter =
    session.user.roles.includes(ROLES.PROJECTS_MANAGER) ||
    session.user.roles.includes(ROLES.SUPER_ADMIN);

  return (
    <ProjectEnquiriesList
      initialEnquiries={JSON.parse(JSON.stringify(enquiries))}
      canManage={canManageProjectEnquiries(session.user.roles)}
      showExecutiveFilter={showExecutiveFilter}
    />
  );
}
