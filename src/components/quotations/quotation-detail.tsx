"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, FileInput, MessageCircle, Pencil, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPricingType } from "@/lib/products";
import { formatQuotationStatus } from "@/lib/quotations";
import { buildQuotationWhatsappUrl } from "@/lib/whatsapp";

type QuotationDetailData = {
  id: string;
  quotationNo: string;
  revisionNo: number;
  status: string;
  quotationDate: string;
  expiryDate: string;
  totalValue: number;
  notes?: string | null;
  customer: {
    id: string;
    customerName: string;
    gstNumber: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    mobile?: string | null;
  };
  salesUser: { name: string; email: string };
  company: {
    name: string;
    bankDetails?: string | null;
    termsAndConditions?: string | null;
  };
  revisions: Array<{
    id: string;
    quotationNo: string;
    revisionNo: number;
    status: string;
  }>;
  items: Array<{
    id: string;
    qty: number;
    rate: number;
    gstRate: number;
    lineTotal: number;
    approvalStatus: string;
    product: {
      displayName: string;
      pricingType: "WP" | "UNIT";
    };
  }>;
  changesFromPrevious?: QuotationLineChange[] | null;
  previousRevisionNo?: number | null;
};

type QuotationLineChange = {
  productId: string;
  productName: string;
  type: "ADDED" | "REMOVED" | "MODIFIED";
  fields: Array<{
    field: "qty" | "rate" | "lineTotal";
    from: number;
    to: number;
  }>;
};

const CHANGE_FIELD_LABEL: Record<QuotationLineChange["fields"][number]["field"], string> = {
  qty: "Qty",
  rate: "Rate",
  lineTotal: "Line Total",
};

function formatChangeValue(
  field: QuotationLineChange["fields"][number]["field"],
  value: number,
): string {
  if (field === "qty") return value.toLocaleString("en-IN");
  return `₹${value.toLocaleString("en-IN")}`;
}

function changeBadgeVariant(
  type: QuotationLineChange["type"],
): "default" | "success" | "warning" | "danger" {
  if (type === "ADDED") return "success";
  if (type === "REMOVED") return "danger";
  return "warning";
}

function changeBadgeLabel(type: QuotationLineChange["type"]): string {
  if (type === "ADDED") return "Added";
  if (type === "REMOVED") return "Removed";
  return "Changed";
}

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "SENT") return "success";
  if (status === "EXPIRED") return "danger";
  if (status === "CONVERTED") return "warning";
  return "default";
}

export function QuotationDetail({
  quotation,
  canManage,
  canApprovePricing,
}: {
  quotation: QuotationDetailData;
  canManage: boolean;
  canApprovePricing: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasPendingApproval = quotation.items.some((item) => item.approvalStatus === "PENDING");

  function handleShareWhatsapp() {
    setError("");
    const url = buildQuotationWhatsappUrl(quotation, window.location.origin);
    if (!url) {
      setError(
        "This customer has no valid mobile number on record. Add one to share on WhatsApp.",
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSend() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/quotations/${quotation.id}/send`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to send quotation.");
      return;
    }
    router.refresh();
  }

  async function handleApprovePricing() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/quotations/${quotation.id}/approve-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve pricing.");
      return;
    }
    router.refresh();
  }

  async function handleConvertToPi() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/quotations/${quotation.id}/convert-to-pi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue: true }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to convert quotation to PI.");
      return;
    }
    router.push(`/sales/proforma-invoices/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{quotation.quotationNo}</h1>
          <p className="text-sm text-slate-500">
            Revision {quotation.revisionNo} · {quotation.customer.customerName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/sales/quotations">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/quotations/${quotation.id}/pdf`} download>
              <Download className="h-4 w-4" />
              PDF
            </a>
          </Button>
          {quotation.customer.mobile ? (
            <Button variant="outline" onClick={handleShareWhatsapp}>
              <MessageCircle className="h-4 w-4" />
              Share on WhatsApp
            </Button>
          ) : null}
          {canManage && quotation.status === "DRAFT" ? (
            <Button disabled={loading} onClick={handleSend}>
              <Send className="h-4 w-4" />
              Send Quotation
            </Button>
          ) : null}
          {canApprovePricing && hasPendingApproval ? (
            <Button variant="secondary" disabled={loading} onClick={handleApprovePricing}>
              <ShieldCheck className="h-4 w-4" />
              Approve Pricing
            </Button>
          ) : null}
          {canManage && (quotation.status === "SENT" || quotation.status === "EXPIRED") ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/quotations/${quotation.id}/revise`}>
                <Pencil className="h-4 w-4" />
                Revise
              </Link>
            </Button>
          ) : null}
          {canManage && quotation.status === "SENT" ? (
            <Button variant="secondary" disabled={loading} onClick={handleConvertToPi}>
              <FileInput className="h-4 w-4" />
              Convert to PI
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusVariant(quotation.status)}>
              {formatQuotationStatus(quotation.status)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quotation Date</CardTitle>
          </CardHeader>
          <CardContent>{quotation.quotationDate.slice(0, 10)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Valid Until</CardTitle>
          </CardHeader>
          <CardContent>{quotation.expiryDate.slice(0, 10)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            ₹{quotation.totalValue.toLocaleString("en-IN")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer & Executive</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Customer</p>
            <p className="font-medium">{quotation.customer.customerName}</p>
            <p className="text-sm text-slate-500">GST: {quotation.customer.gstNumber}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Sales Executive</p>
            <p className="font-medium">{quotation.salesUser.name}</p>
            <p className="text-sm text-slate-500">{quotation.salesUser.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotation.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product.displayName}</TableCell>
                  <TableCell>{item.qty}</TableCell>
                  <TableCell>
                    ₹{item.rate.toLocaleString("en-IN")} ({formatPricingType(item.product.pricingType)})
                  </TableCell>
                  <TableCell>{item.gstRate}%</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.approvalStatus === "PENDING"
                          ? "warning"
                          : item.approvalStatus === "APPROVED"
                            ? "success"
                            : "default"
                      }
                    >
                      {item.approvalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{item.lineTotal.toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(quotation.company.bankDetails || quotation.company.termsAndConditions || quotation.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Footer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {quotation.company.bankDetails ? (
              <div>
                <p className="font-medium">Bank Details</p>
                <p className="text-slate-600">{quotation.company.bankDetails}</p>
              </div>
            ) : null}
            {quotation.company.termsAndConditions ? (
              <div>
                <p className="font-medium">Terms & Conditions</p>
                <p className="text-slate-600">{quotation.company.termsAndConditions}</p>
              </div>
            ) : null}
            {quotation.notes ? (
              <div>
                <p className="font-medium">Notes</p>
                <p className="text-slate-600">{quotation.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {quotation.changesFromPrevious && quotation.changesFromPrevious.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Changes from Revision {quotation.previousRevisionNo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotation.changesFromPrevious.map((change) => (
              <div
                key={change.productId}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={changeBadgeVariant(change.type)}>
                    {changeBadgeLabel(change.type)}
                  </Badge>
                  <span className="font-medium">{change.productName}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {change.type === "MODIFIED" ? (
                    change.fields.map((field) => (
                      <span key={field.field}>
                        {CHANGE_FIELD_LABEL[field.field]}:{" "}
                        <span className="text-slate-400 line-through">
                          {formatChangeValue(field.field, field.from)}
                        </span>{" "}
                        <span className="font-medium text-slate-900">
                          {formatChangeValue(field.field, field.to)}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span>
                      {change.fields
                        .filter((field) => field.field !== "lineTotal")
                        .map((field) => {
                          const value = change.type === "ADDED" ? field.to : field.from;
                          return `${CHANGE_FIELD_LABEL[field.field]}: ${formatChangeValue(field.field, value)}`;
                        })
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {quotation.revisions.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revision History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quotation.revisions.map((revision) => (
              <div key={revision.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {revision.quotationNo} · Rev {revision.revisionNo}
                  </p>
                  <p className="text-sm text-slate-500">{formatQuotationStatus(revision.status)}</p>
                </div>
                {revision.id !== quotation.id ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/sales/quotations/${revision.id}`}>Open</Link>
                  </Button>
                ) : (
                  <Badge>Current</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
