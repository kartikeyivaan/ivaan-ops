"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QUOTATION_VALIDITY_DAYS, calculateLineAmounts } from "@/lib/quotations";
import { formatPricingType } from "@/lib/products";

type Customer = {
  id: string;
  customerName: string;
  gstNumber: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

type Product = {
  id: string;
  displayName: string;
  pricingType: "WP" | "UNIT";
  capacity: number;
  gstRate: number;
  currentPrice: {
    standardPrice: number;
    minimumPrice: number;
  } | null;
};

type LineDraft = {
  productId: string;
  qty: string;
  rate: string;
};

type SalesExecutive = { id: string; name: string; email: string };

function defaultProductLine(product: Product | undefined): LineDraft {
  return {
    productId: product?.id ?? "",
    qty: "",
    rate: product?.currentPrice ? String(product.currentPrice.standardPrice) : "",
  };
}

export function QuotationForm({
  customers,
  products,
  defaultCustomerId,
  salesExecutives,
  defaultSalesUserId,
  mode = "create",
  quotationId,
  quotationNo,
  initialLines,
  initialNotes,
}: {
  customers: Customer[];
  products: Product[];
  defaultCustomerId?: string;
  salesExecutives: SalesExecutive[];
  defaultSalesUserId: string;
  mode?: "create" | "revise";
  quotationId?: string;
  quotationNo?: string;
  initialLines?: LineDraft[];
  initialNotes?: string;
}) {
  const isRevise = mode === "revise";
  const router = useRouter();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? customers[0]?.id ?? "");
  const [salesUserId, setSalesUserId] = useState(
    salesExecutives.some((user) => user.id === defaultSalesUserId)
      ? defaultSalesUserId
      : (salesExecutives[0]?.id ?? defaultSalesUserId),
  );
  const defaultProduct = products[0];
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines && initialLines.length > 0 ? initialLines : [defaultProductLine(defaultProduct)],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      const qty = Number(line.qty);
      const rate = Number(line.rate);
      if (!product || !qty || Number.isNaN(rate)) {
        return { lineTotal: 0, gstRate: product?.gstRate ?? 0, belowMinimum: false };
      }

      const { lineTotal } = calculateLineAmounts({
        pricingType: product.pricingType,
        capacity: product.capacity,
        qty,
        rate,
        gstRate: product.gstRate,
      });

      const belowMinimum =
        product.currentPrice !== null && rate < product.currentPrice.minimumPrice;

      return {
        lineTotal,
        gstRate: product.gstRate,
        belowMinimum,
        pricingLabel: formatPricingType(product.pricingType),
      };
    });
  }, [lines, products]);

  const grandTotal = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (products.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotation Builder</h1>
          <p className="mt-2 text-sm text-red-600">
            No active products are available. Add products under Products before creating a
            quotation.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/sales/quotations">
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>
    );
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, defaultProductLine(products[0])]);
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

  async function submit(send: boolean) {
    setError("");

    const invalidLine = lines.find((line) => {
      const product = products.find((item) => item.id === line.productId);
      return !product?.currentPrice;
    });
    if (invalidLine) {
      setError("Selected product does not have a configured price for this company.");
      return;
    }

    setLoading(true);

    const mappedLines = lines.map((line) => ({
      productId: line.productId,
      qty: Number(line.qty),
      rate: Number(line.rate),
    }));

    const endpoint = isRevise ? `/api/quotations/${quotationId}/revise` : "/api/quotations";
    const payload = isRevise
      ? { notes: notes || undefined, send, lines: mappedLines }
      : { customerId, salesUserId, notes: notes || undefined, send, lines: mappedLines };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save quotation.");
      return;
    }

    router.push(`/sales/quotations/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isRevise ? `Revise ${quotationNo ?? "Quotation"}` : "Quotation Builder"}
          </h1>
          <p className="text-sm text-slate-500">
            {isRevise
              ? "Saving creates a new revision. The original is kept for history."
              : `Validity is fixed at ${QUOTATION_VALIDITY_DAYS} days from quotation date.`}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={isRevise && quotationId ? `/sales/quotations/${quotationId}` : "/sales/quotations"}>
            <ArrowLeft className="h-4 w-4" />
            {isRevise ? "Back to quotation" : "Back to list"}
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
            {isRevise ? (
              <Input value={selectedCustomer?.customerName ?? ""} readOnly />
            ) : (
              <select
                id="customer"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customerName}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="salesUserId">Sales Executive</Label>
            {isRevise ? (
              <Input
                value={salesExecutives.find((user) => user.id === salesUserId)?.name ?? ""}
                readOnly
              />
            ) : (
              <select
                id="salesUserId"
                value={salesUserId}
                onChange={(event) => setSalesUserId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {salesExecutives.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {selectedCustomer ? (
            <>
              <div>
                <p className="text-xs uppercase text-slate-500">GST</p>
                <p className="font-medium">{selectedCustomer.gstNumber}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Address</p>
                <p className="font-medium">
                  {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.state]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Line Items</CardTitle>
            <p className="text-sm text-slate-500">
              {products.length} active product{products.length === 1 ? "" : "s"} available
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => {
            const computed = computedLines[index];
            const lineProduct = products.find((item) => item.id === line.productId);
            const missingPrice = lineProduct !== undefined && lineProduct.currentPrice === null;
            return (
              <div
                key={index}
                className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
              >
                <div className="space-y-2">
                  <Label>Product</Label>
                  <select
                    value={line.productId}
                    onChange={(event) => handleProductChange(index, event.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.displayName}
                        {product.currentPrice ? "" : " (price not configured)"}
                      </option>
                    ))}
                  </select>
                  {missingPrice ? (
                    <p className="text-xs text-amber-700">
                      Configure a price for this product under Products before saving.
                    </p>
                  ) : null}
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
                  <Label>Rate ({computed?.pricingLabel ?? "Rate"})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.rate}
                    onChange={(event) => updateLine(index, { rate: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GST</Label>
                  <Input value={`${computed?.gstRate ?? 0}%`} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Total</Label>
                  <Input value={`₹${(computed?.lineTotal ?? 0).toLocaleString("en-IN")}`} readOnly />
                  {computed?.belowMinimum ? (
                    <p className="text-xs text-amber-700">Below minimum — manager approval required</p>
                  ) : null}
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() => removeLine(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Footer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes for the quotation"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-lg font-semibold">
              Grand Total: ₹{grandTotal.toLocaleString("en-IN")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={loading} onClick={() => submit(false)}>
                {isRevise ? "Save Revision as Draft" : "Save Draft"}
              </Button>
              <Button disabled={loading} onClick={() => submit(true)}>
                {isRevise ? "Save & Send Revision" : "Save & Send"}
              </Button>
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
