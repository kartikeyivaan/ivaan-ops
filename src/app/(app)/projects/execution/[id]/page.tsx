import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  canCloseProject,
  canEditProjectMaterial,
  canReturnProjectStock,
  canViewExecutionProjects,
  canViewLinkedPurchaseRequests,
} from "@/lib/project-permissions";
import { getProjectById, listLinkedPurchaseRequests } from "@/lib/project-service";
import { listProjectDispatchHistory } from "@/lib/project-dispatch-service";
import { listProducts } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectDetailView } from "@/components/projects/project-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectExecutionDetailPage({ params }: PageProps) {
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

  const { id } = await params;

  try {
    const [project, products, dispatches, linkedPurchaseRequests] = await Promise.all([
      getProjectById(prisma, companyId, id),
      listProducts(prisma, companyId, { isActive: true }),
      listProjectDispatchHistory(prisma, companyId, id),
      canViewLinkedPurchaseRequests(session.user.roles)
        ? listLinkedPurchaseRequests(prisma, companyId, id)
        : Promise.resolve([]),
    ]);

    return (
      <div className="space-y-4">
        <Link
          href="/projects/execution"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Link>
        <ProjectDetailView
          project={project}
          products={products.map((product) => ({
            id: product.id,
            displayName: product.displayName,
          }))}
          canEdit={canEditProjectMaterial(session.user.roles)}
          canClose={canCloseProject(session.user.roles)}
          canReturnStock={canReturnProjectStock(session.user.roles)}
          dispatches={JSON.parse(JSON.stringify(dispatches))}
          linkedPurchaseRequests={JSON.parse(JSON.stringify(linkedPurchaseRequests))}
        />
      </div>
    );
  } catch {
    notFound();
  }
}
