"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerForm } from "@/components/customers/customer-form";
import { formatCustomerType } from "@/lib/customers";
import { formatPaymentMode, formatProformaStatus } from "@/lib/proforma-invoices";
import { formatDispatchStatus } from "@/lib/dispatches";
import { formatQuotationStatus } from "@/lib/quotations";
import { formatDate, formatDocumentDate } from "@/lib/utils";
import type { CustomerListItem } from "@/lib/customer-service";

type SalesExecutive = { id: string; name: string; email: string };

type CustomerQuotation = {
  id: string;
  quotationNo: string;
  revisionNo: number;
  status: string;
  quotationDate: string;
  expiryDate: string;
  totalValue: number;
};

type CustomerProformaInvoice = {
  id: string;
  piNo: string;
  status: string;
  piDate: string;
  totalValue: number;
  paymentSummary: { outstanding: number };
};

type CustomerPayment = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  referenceNo?: string | null;
  proformaInvoice: { piNo: string };
};

type CustomerDispatch = {
  id: string;
  dcNo: string;
  status: string;
  dispatchDate: string;
  totalValue: number;
  proformaInvoice: { piNo: string };
};

export function CustomerProfile({
  customer,
  salesExecutives,
  customerQuotations,
  customerProformaInvoices,
  customerPayments,
  customerDispatches,
  canEdit,
  canManageQuotations,
  canManageProformaInvoices,
}: {
  customer: CustomerListItem;
  salesExecutives: SalesExecutive[];
  customerQuotations: CustomerQuotation[];
  customerProformaInvoices: CustomerProformaInvoice[];
  customerPayments: CustomerPayment[];
  customerDispatches: CustomerDispatch[];
  canEdit: boolean;
  canManageQuotations: boolean;
  canManageProformaInvoices: boolean;
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/sales/customers">Back to list</Link>
          </Button>
          {canEdit ? (
            <Button asChild>
              <Link href={`/sales/customers/${customer.id}/edit`}>Edit Customer</Link>
            </Button>
          ) : null}
        </div>
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
                <p className="text-xs uppercase text-slate-500">Firm Name</p>
                <p className="font-medium">{customer.customerName}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Contact Person</p>
                <p className="font-medium">{customer.contactPersonName ?? "—"}</p>
              </div>
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
                <p className="text-xs uppercase text-slate-500">PIN Code</p>
                <p className="font-medium">{customer.pinCode ?? "—"}</p>
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
          <Card>
            <CardContent className="space-y-3 pt-6">
              {canManageQuotations ? (
                <Button asChild size="sm">
                  <Link href={`/sales/quotations/new?customerId=${customer.id}`}>
                    New Quotation
                  </Link>
                </Button>
              ) : null}
              {customerQuotations.length === 0 ? (
                <p className="text-sm text-slate-500">No quotations for this customer yet.</p>
              ) : (
                customerQuotations.map((quotation) => (
                  <div
                    key={quotation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {quotation.quotationNo}
                        {quotation.revisionNo > 1 ? ` (R${quotation.revisionNo})` : ""}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDocumentDate(quotation.quotationDate)} · Valid until{" "}
                        {formatDocumentDate(quotation.expiryDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{formatQuotationStatus(quotation.status)}</Badge>
                      <p className="font-medium">₹{quotation.totalValue.toLocaleString("en-IN")}</p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/sales/quotations/${quotation.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pi">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {canManageProformaInvoices ? (
                <Button asChild size="sm">
                  <Link href={`/sales/proforma-invoices/new?customerId=${customer.id}`}>
                    New PI
                  </Link>
                </Button>
              ) : null}
              {customerProformaInvoices.length === 0 ? (
                <p className="text-sm text-slate-500">No proforma invoices for this customer yet.</p>
              ) : (
                customerProformaInvoices.map((pi) => (
                  <div
                    key={pi.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{pi.piNo}</p>
                      <p className="text-sm text-slate-500">{formatDocumentDate(pi.piDate)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{formatProformaStatus(pi.status)}</Badge>
                      <p className="font-medium">₹{pi.totalValue.toLocaleString("en-IN")}</p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/sales/proforma-invoices/${pi.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {customerPayments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded for this customer yet.</p>
              ) : (
                customerPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{payment.proformaInvoice.piNo}</p>
                      <p className="text-sm text-slate-500">
                        {payment.paymentDate} · {formatPaymentMode(payment.paymentMode)}
                        {payment.referenceNo ? ` · ${payment.referenceNo}` : ""}
                      </p>
                    </div>
                    <p className="font-medium">₹{payment.amount.toLocaleString("en-IN")}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dispatches">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {customerDispatches.length === 0 ? (
                <p className="text-sm text-slate-500">No dispatches for this customer yet.</p>
              ) : (
                customerDispatches.map((dispatch) => (
                  <div
                    key={dispatch.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{dispatch.dcNo}</p>
                      <p className="text-sm text-slate-500">
                        {formatDocumentDate(dispatch.dispatchDate)} · {dispatch.proformaInvoice.piNo}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{formatDispatchStatus(dispatch.status)}</Badge>
                      <p className="font-medium">₹{dispatch.totalValue.toLocaleString("en-IN")}</p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/inventory/dispatches/${dispatch.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canEdit ? (
          <TabsContent value="edit">
            <CustomerForm
              mode="edit"
              customerId={customer.id}
              customerCode={customer.customerCode}
              salesExecutives={salesExecutives}
              cancelHref={`/sales/customers/${customer.id}`}
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
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
