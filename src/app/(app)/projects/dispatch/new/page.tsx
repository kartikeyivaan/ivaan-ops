import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireProjectsCompany } from "@/lib/company-scope";
import { SimpleProjectDispatchForm } from "@/components/projects/simple-project-dispatch-form";
import { canPrepareSimpleProjectDispatch } from "@/lib/project-permissions";

export default async function NewSimpleProjectDispatchPage() {
  const session = await auth();
  if (!session?.user || !canPrepareSimpleProjectDispatch(session.user.roles)) {
    redirect("/dashboard");
  }

  try {
    requireProjectsCompany(session);
  } catch {
    redirect("/dashboard");
  }

  return <SimpleProjectDispatchForm />;
}
