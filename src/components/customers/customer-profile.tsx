"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerForm } from "@/components/customers/customer-form";
import { formatCustomerType } from "@/lib/customers";
import type { CustomerListItem } from "@/lib/customer-service";

type SalesExecutive = { id: string; name: string; email: string };

export function CustomerProfile({
  customer,
  salesExecutives,
  canEdit,
}: {
  customer: CustomerListItem;
  salesExecutives: SalesExecutive[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{customer.customerName}</h1>
          <p className="text-sm text-slate-500">
            {customer.customerCode} · {formatCustomerType(customer.customerType)}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/sales/customers">Back to list</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ₹{customer.metrics.outstandingValue.toLocaleString("en-IN")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open Quotations</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {customer.metrics.openQuotationCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open PI</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{customer.metrics.openPiCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dispatch This Year</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ₹{customer.metrics.totalDispatchValueThisYear.toLocaleString("en-IN")}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="pi">PI</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="dispatches">Dispatches</TabsTrigger>
          {canEdit ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-slate-500">GST</p>
                <p className="font-medium">{customer.gstNumber}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Assigned Executive</p>
                <p className="font-medium">{customer.assignedSalesUser.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">City</p>
                <p className="font-medium">{customer.city ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Status</p>
                <Badge variant={customer.status === "ACTIVE" ? "success" : "danger"}>
                  {customer.status}
                </Badge>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase text-slate-500">Address</p>
                <p className="font-medium">{customer.address ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Mobile</p>
                <p className="font-medium">{customer.mobile ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Email</p>
                <p className="font-medium">{customer.email ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {customer.contacts.length === 0 ? (
                <p className="text-sm text-slate-500">No optional contacts added.</p>
              ) : (
                customer.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-md border p-3">
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-sm text-slate-500">{contact.designation ?? "—"}</p>
                    <p className="text-sm">{contact.mobile ?? "—"}</p>
                    <p className="text-sm">{contact.email ?? "—"}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotations">
          <PlaceholderTab module="Quotations" prompt="Prompt 06" />
        </TabsContent>
        <TabsContent value="pi">
          <PlaceholderTab module="Proforma Invoices" prompt="Prompt 07" />
        </TabsContent>
        <TabsContent value="payments">
          <PlaceholderTab module="Payments" prompt="Prompt 07" />
        </TabsContent>
        <TabsContent value="dispatches">
          <PlaceholderTab module="Dispatches" prompt="Prompt 08" />
        </TabsContent>

        {canEdit ? (
          <TabsContent value="edit">
            <CustomerForm
              mode="edit"
              customerId={customer.id}
              salesExecutives={salesExecutives}
              initialValues={{
                customerName: customer.customerName,
                customerType: customer.customerType,
                gstNumber: customer.gstNumber,
                address: customer.address ?? "",
                city: customer.city ?? "",
                state: customer.state ?? "",
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
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function PlaceholderTab({ module, prompt }: { module: string; prompt: string }) {
  return (
    <Card>
      <CardContent className="pt-6 text-sm text-slate-500">
        {module} history will appear here after {prompt} is implemented.
      </CardContent>
    </Card>
  );
}
