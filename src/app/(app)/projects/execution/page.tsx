import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewExecutionProjects } from "@/lib/project-permissions";
import { listProjects } from "@/lib/project-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectList } from "@/components/projects/project-list";

export default async function ProjectsExecutionPage() {
  const session = await auth();
  if (!session?.user || !canViewExecutionProjects(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const projects = await listProjects(prisma, companyId);

  return <ProjectList initialProjects={projects} />;
}
