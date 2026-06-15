import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole, isSuperAdmin, ROLES } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WarehouseForm } from "@/components/admin/warehouse-form";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
        <p className="text-sm text-slate-500">Warehouse master by company.</p>
      </div>

      {isSuperAdmin(session.user.roles) ? (
        <WarehouseForm companies={companies} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Warehouse List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell>{warehouse.company.code}</TableCell>
                  <TableCell className="font-medium">{warehouse.name}</TableCell>
                  <TableCell>{warehouse.code ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={warehouse.isActive ? "success" : "danger"}>
                      {warehouse.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
