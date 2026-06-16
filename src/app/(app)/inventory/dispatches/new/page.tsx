import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { DispatchForm } from "@/components/dispatches/dispatch-form";

type PageProps = { searchParams: Promise<{ piId?: string }> };

export default async function NewDispatchPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageDispatches(session.user.roles)) {
    redirect("/inventory/dispatches");
  }

  const { piId } = await searchParams;

  return <DispatchForm defaultPiId={piId} />;
}
