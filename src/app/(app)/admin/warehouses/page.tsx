import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole, isSuperAdmin, ROLES } from "@/lib/rbac";
import { WarehouseForm } from "@/components/admin/warehouse-form";
import { WarehousesList } from "@/components/admin/warehouses-list";

export default async function WarehousesAdminPage() {
  const session = await auth();
  const allowed = hasRole(session?.user.roles ?? [], [
    ROLES.SUPER_ADMIN,
    ROLES.SALES_MANAGER,
  ]);
  if (!session?.user || !allowed) {
    redirect("/dashboard");
  }

  const companyFilter = isSuperAdmin(session.user.roles)
    ? undefined
    : { id: { in: session.user.companies.map((c) => c.id) } };

  const [warehouses, companies] = await Promise.all([
    prisma.warehouse.findMany({
      where: isSuperAdmin(session.user.roles)
        ? undefined
        : { companyId: { in: session.user.companies.map((c) => c.id) } },
      include: { company: true },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.company.findMany({
      where: companyFilter,
      orderBy: { name: "asc" },
    }),
  ]);

  const canManage = isSuperAdmin(session.user.roles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
        <p className="text-sm text-slate-500">Warehouse master by company.</p>
      </div>

      {canManage ? <WarehouseForm companies={companies} /> : null}

      <WarehousesList
        warehouses={warehouses}
        companies={companies}
        canManage={canManage}
      />
    </div>
  );
}
