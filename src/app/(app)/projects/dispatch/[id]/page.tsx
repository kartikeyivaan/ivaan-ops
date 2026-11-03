import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireProjectsCompany } from "@/lib/company-scope";
import { SimpleProjectDispatchDetail } from "@/components/projects/simple-project-dispatch-detail";
import {
  canCancelSimpleProjectDispatch,
  canConfirmSimpleProjectDispatch,
  canPrepareSimpleProjectDispatch,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import { getSimpleProjectDispatch } from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function SimpleProjectDispatchDetailPage({ params }: PageProps) {
  const session = await auth();
  if (
    !session?.user ||
    (!canViewProjectDispatches(session.user.roles) &&
      !canPrepareSimpleProjectDispatch(session.user.roles))
  ) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireProjectsCompany(session);
  } catch {
    redirect("/dashboard");
  }

  const { id } = await params;

  let dispatch;
  try {
    dispatch = await getSimpleProjectDispatch(prisma, companyId, id);
  } catch {
    notFound();
  }

  return (
    <SimpleProjectDispatchDetail
      dispatch={dispatch}
      canConfirm={canConfirmSimpleProjectDispatch(session.user.roles)}
      canCancel={canCancelSimpleProjectDispatch(session.user.roles)}
      canPrepare={canPrepareSimpleProjectDispatch(session.user.roles)}
    />
  );
}
