import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireProjectsCompany } from "@/lib/company-scope";
import { SimpleProjectDispatchList } from "@/components/projects/simple-project-dispatch-list";
import {
  canPrepareSimpleProjectDispatch,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import { listSimpleProjectDispatches } from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";

export default async function SimpleProjectDispatchPage() {
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

  const rows = await listSimpleProjectDispatches(prisma, companyId);

  return (
    <SimpleProjectDispatchList
      initialRows={rows}
      canPrepare={canPrepareSimpleProjectDispatch(session.user.roles)}
    />
  );
}
