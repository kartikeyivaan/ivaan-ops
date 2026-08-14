import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageProjectDispatches,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import { getProjectDispatchById } from "@/lib/project-dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectDispatchDetail } from "@/components/projects/project-dispatch-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDispatchDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewProjectDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const dispatch = await getProjectDispatchById(prisma, companyId, id);
  if (!dispatch) {
    notFound();
  }

  return (
    <ProjectDispatchDetail
      dispatch={JSON.parse(JSON.stringify(dispatch))}
      canManage={canManageProjectDispatches(session.user.roles)}
    />
  );
}
