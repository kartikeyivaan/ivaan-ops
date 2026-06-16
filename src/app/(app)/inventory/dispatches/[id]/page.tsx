import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveDispatchCancel,
  canManageDispatches,
  canViewDispatches,
} from "@/lib/dispatch-permissions";
import { getDispatchById } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DispatchDetail } from "@/components/dispatches/dispatch-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function DispatchDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const dispatch = await getDispatchById(prisma, companyId, id);
  if (!dispatch) {
    notFound();
  }

  return (
    <DispatchDetail
      dispatch={JSON.parse(JSON.stringify(dispatch))}
      canManage={canManageDispatches(session.user.roles)}
      canApproveCancel={canApproveDispatchCancel(session.user.roles)}
    />
  );
}
