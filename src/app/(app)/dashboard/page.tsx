import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();
  const roles = session?.user.roles ?? [];
  const activeCompany = session?.user.companies.find(
    (c) => c.id === session.user.activeCompanyId,
  );

  const widgets =
    roles.includes(ROLES.SUPER_ADMIN)
      ? [
          "Sales by Executive",
          "This Month Sales Value",
          "Pending Approvals",
          "Inventory Value",
          "Pending Payments",
        ]
      : roles.includes(ROLES.SALES_EXECUTIVE)
        ? [
            "Open Quotations",
            "Booked Orders",
            "Order Value This Month",
            "Available Qty For Sale",
          ]
        : roles.includes(ROLES.WAREHOUSE)
          ? [
              "Today's Dispatches",
              "Pending Inwarding",
              "Low Stock",
              "Transfer Requests",
            ]
          : ["Role-based dashboard"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {activeCompany
            ? `Working in ${activeCompany.name} (${activeCompany.code})`
            : "No active company selected"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {widgets.map((widget) => (
          <Card key={widget}>
            <CardHeader>
              <CardTitle className="text-base">{widget}</CardTitle>
              <CardDescription>Placeholder for Sprint 1 module data</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-300">—</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
