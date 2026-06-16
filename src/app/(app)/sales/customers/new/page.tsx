import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { canEditCustomers } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/components/customers/customer-form";

const GST_TAXPAYER_SEARCH_URL = "https://services.gst.gov.in/services/searchtp";

export default async function NewCustomerPage() {
  const session = await auth();
  if (!session?.user || !canEditCustomers(session.user.roles)) {
    redirect("/sales/customers");
  }

  const companyId = requireActiveCompany(session);
  const salesExecutives = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: {
              in: [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN],
            },
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Customer</h1>
          <p className="text-sm text-slate-500">Create a company-owned customer record.</p>
        </div>
        <Button asChild variant="outline">
          <a href={GST_TAXPAYER_SEARCH_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Search Taxpayer
          </a>
        </Button>
      </div>
      <CustomerForm mode="create" salesExecutives={salesExecutives} />
    </div>
  );
}
