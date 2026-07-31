import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canReportDamage } from "@/lib/inventory-permissions";
import { DamagedItemForm } from "@/components/inventory/damaged-item-form";

export default async function NewDamagedItemPage() {
  const session = await auth();
  if (!session?.user || !canReportDamage(session.user.roles)) {
    redirect("/inventory/damaged");
  }

  return <DamagedItemForm />;
}
