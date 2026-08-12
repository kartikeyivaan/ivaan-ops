import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { ROLES } from "@/lib/rbac";
import { ProjectEnquiryForm } from "@/components/project-enquiries/project-enquiry-form";

export default async function NewProjectEnquiryPage() {
  const session = await auth();
  if (!session?.user || !canManageProjectEnquiries(session.user.roles)) {
    redirect("/dashboard");
  }

  const showExecutiveField =
    session.user.roles.includes(ROLES.PROJECTS_MANAGER) ||
    session.user.roles.includes(ROLES.SUPER_ADMIN);

  return <ProjectEnquiryForm showExecutiveField={showExecutiveField} />;
}
