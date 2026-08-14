import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDispatches, canViewDispatches } from "@/lib/dispatch-permissions";
import { listDispatchableProformaInvoices } from "@/lib/dispatch-service";
import {
  canManageProjectDispatches,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import { listDispatchableProjects } from "@/lib/project-dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchesHub } from "@/components/inventory/dispatches-hub";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DispatchesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { tab } = await searchParams;
  const canViewProjects = canViewProjectDispatches(session.user.roles);

  const [tiles, projectQueue] = await Promise.all([
    listDispatchableProformaInvoices(prisma, companyId),
    canViewProjects ? listDispatchableProjects(prisma, companyId) : Promise.resolve([]),
  ]);

  return (
    <DispatchesHub
      retailTiles={JSON.parse(JSON.stringify(tiles))}
      projectQueue={JSON.parse(JSON.stringify(projectQueue))}
      canManageRetail={canManageDispatches(session.user.roles)}
      canManageProjects={canManageProjectDispatches(session.user.roles)}
      canViewProjects={canViewProjects}
      initialTab={tab === "projects" && canViewProjects ? "projects" : "retail"}
    />
  );
}
