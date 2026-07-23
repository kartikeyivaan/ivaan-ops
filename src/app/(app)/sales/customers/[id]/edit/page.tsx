import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEditCustomers, canViewCustomers } from "@/lib/customer-permissions";
import { getCustomerById } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCustomerPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
    redirect("/dashboard");
  }

  const canEdit = canEditCustomers(session.user.roles);
  const companyId = requireActiveCompany(session);
  const { id } = await params;

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Customer</h1>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-red-600">You do not have permission to edit customers.</p>
            <Button variant="outline" asChild>
              <Link href="/sales/customers">Back to list</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [customer, salesExecutives] = await Promise.all([
    getCustomerById(prisma, companyId, id),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
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
    }),
  ]);

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit Customer</h1>
        <p className="text-sm font-medium text-slate-600">{customer.customerCode}</p>
      </div>
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Created By</p>
            <p className="font-medium">{customer.createdBy.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Created Date</p>
            <p className="font-medium">{formatDate(customer.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Modified By</p>
            <p className="font-medium">{customer.updatedBy.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Modified Date</p>
            <p className="font-medium">{formatDate(customer.updatedAt)}</p>
          </div>
        </CardContent>
      </Card>
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        customerCode={customer.customerCode}
        salesExecutives={salesExecutives}
        showCardTitle={false}
        cancelHref="/sales/customers"
        successRedirect="/sales/customers?updated=1"
        initialValues={{
          customerName: customer.customerName,
          contactPersonName: customer.contactPersonName ?? "",
          customerType: customer.customerType,
          gstNumber: customer.gstNumber,
          address: customer.address ?? "",
          city: customer.city ?? "",
          state: customer.state ?? "",
          pinCode: customer.pinCode ?? "",
          mobile: customer.mobile ?? "",
          email: customer.email ?? "",
          assignedSalesUserId: customer.assignedSalesUserId,
          status: customer.status,
          contacts: customer.contacts.map((contact) => ({
            name: contact.name,
            designation: contact.designation ?? "",
            mobile: contact.mobile ?? "",
            email: contact.email ?? "",
          })),
        }}
      />
    </div>
  );
}
