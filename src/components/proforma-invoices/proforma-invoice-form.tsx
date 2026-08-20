"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateLineAmounts } from "@/lib/quotations";
import { formatPricingType } from "@/lib/products";

type Customer = {
  id: string;
  customerName: string;
  gstNumber: string;
};

type Product = {
  id: string;
  displayName: string;
  pricingType: "WP" | "UNIT";
  capacity: number;
  gstRate: number;
  currentPrice: { standardPrice: number } | null;
};

type LineDraft = {
  productId: string;
  qty: string;
  rate: string;
};

export function ProformaInvoiceForm({
  customers,
  products,
  defaultCustomerId,
  mode = "create",
  piId,
  piNo,
  status = "DRAFT",
  lockCustomer = false,
  requiresApproval = false,
  initialNotes,
  initialLines,
}: {
  customers: Customer[];
  products: Product[];
  defaultCustomerId?: string;
  mode?: "create" | "edit";
  piId?: string;
  piNo?: string;
  status?: string;
  lockCustomer?: boolean;
  requiresApproval?: boolean;
  initialNotes?: string;
  initialLines?: LineDraft[];
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? customers[0]?.id ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [issue, setIssue] = useState(!isEdit);
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines && initialLines.length > 0
      ? initialLines
      : [
          {
            productId: products[0]?.id ?? "",
            qty: "",
            rate: products[0]?.currentPrice ? String(products[0].currentPrice.standardPrice) : "",
          },
        ],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      const qty = Number(line.qty);
      const rate = Number(line.rate);
      if (!product || !qty || Number.isNaN(rate)) {
        return { lineTotal: 0, gstAmount: 0, gstRate: product?.gstRate ?? 0 };
      }
      const { lineTotal, gstAmount } = calculateLineAmounts({
        pricingType: product.pricingType,
        capacity: product.capacity,
        qty,
        rate,
        gstRate: product.gstRate,
      });
      return { lineTotal, gstAmount, gstRate: product.gstRate };
    });
  }, [lines, products]);

  const grandTotal = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const backHref = isEdit && piId ? `/sales/proforma-invoices/${piId}` : "/sales/proforma-invoices";
  const canIssueOnSave = !isEdit || status === "DRAFT";
  const showApprovalFlow = isEdit && requiresApproval;

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    const product = products[0];
    setLines((current) => [
      ...current,
      {
        productId: product?.id ?? "",
        qty: "",
        rate: product?.currentPrice ? String(product.currentPrice.standardPrice) : "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function handleProductChange(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, {
      productId,
      rate: product?.currentPrice ? String(product.currentPrice.standardPrice) : "",
    });
  }

  async function handleSubmit(saveAsDraft: boolean) {
    setError("");
    setLoading(true);

    const payload = {
      notes: notes || undefined,
      issue: canIssueOnSave ? (saveAsDraft ? false : issue) : false,
      lines: lines.map((line) => ({
        productId: line.productId,
        qty: Number(line.qty),
        rate: Number(line.rate),
      })),
      ...(isEdit ? {} : { customerId }),
    };

    const response = await fetch(
      isEdit && piId ? `/api/proforma-invoices/${piId}` : "/api/proforma-invoices",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(
        data.message ??
          (isEdit ? "Unable to update proforma invoice." : "Unable to create proforma invoice."),
      );
      return;
    }

    if (isEdit && requiresApproval) {
      router.push(`/sales/proforma-invoices/${data.id}?editSubmitted=1`);
      return;
    }

    router.push(`/sales/proforma-invoices/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEdit ? `Edit ${piNo ?? "Proforma Invoice"}` : "New Proforma Invoice"}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit
              ? requiresApproval
                ? "Submit product and quantity changes for Sales Manager approval. Customer cannot be changed. Line totals and GST update automatically."
                : "Update products, quantities, or rates. Customer cannot be changed. Line totals and GST update automatically. The PI number stays the same."
              : "Create a direct PI without a quotation."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <select
              id="customer"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              disabled={isEdit || lockCustomer}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customerName} ({customer.gstNumber})
                </option>
              ))}
            </select>
            {isEdit || lockCustomer ? (
              <p className="text-xs text-slate-500">
                {isEdit
                  ? "Customer cannot be changed on an existing PI."
                  : "Customer is locked because this PI was converted from a quotation."}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId);
            return (
              <div key={index} className="grid gap-3 rounded-md border p-4 md:grid-cols-5">
                <div className="space-y-2 md:col-span-2">
                  <Label>Product</Label>
                  <select
                    value={line.productId}
                    onChange={(event) => handleProductChange(index, event.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.qty}
                    onChange={(event) => updateLine(index, { qty: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rate ({product ? formatPricingType(product.pricingType) : ""})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.rate}
                    onChange={(event) => updateLine(index, { rate: event.target.value })}
                  />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      GST {computedLines[index]?.gstRate ?? product?.gstRate ?? 0}%
                    </p>
                    <p className="text-xs text-slate-500">
                      ₹{(computedLines[index]?.gstAmount ?? 0).toLocaleString("en-IN")}
                    </p>
                    <p className="text-xs text-slate-500">Line Total</p>
                    <p className="font-medium">
                      ₹{(computedLines[index]?.lineTotal ?? 0).toLocaleString("en-IN")}
                    </p>
                  </div>
                  {lines.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <p className="text-right text-lg font-semibold">
            Grand Total: ₹{grandTotal.toLocaleString("en-IN")}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {showApprovalFlow ? (
          <>
            <Button disabled={loading} onClick={() => handleSubmit(false)}>
              Submit for Approval
            </Button>
            {canIssueOnSave ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={issue}
                  onChange={(event) => setIssue(event.target.checked)}
                />
                Issue PI when edit is approved
              </label>
            ) : null}
          </>
        ) : canIssueOnSave ? (
          <>
            <Button disabled={loading} onClick={() => handleSubmit(false)}>
              {issue ? "Save & Issue PI" : "Save Draft"}
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => handleSubmit(true)}
            >
              Save as Draft
            </Button>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={issue}
                onChange={(event) => setIssue(event.target.checked)}
              />
              Issue immediately on save
            </label>
          </>
        ) : (
          <Button disabled={loading} onClick={() => handleSubmit(false)}>
            Save PI
          </Button>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
