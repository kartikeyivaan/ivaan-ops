"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import {
  getDeliveryTermNote,
  type DeliveryTermMode,
} from "@/lib/delivery-terms";
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

type CompanyOption = { id: string; name: string; code: string };

function emptyProductLine(): LineDraft {
  return {
    productId: "",
    qty: "",
    rate: "",
  };
}

export function QuotationForm({
  customers,
  products,
  companies = [],
  selectedCompanyId,
  defaultCustomerId,
  salesExecutives,
  defaultSalesUserId,
  mode = "create",
  quotationId,
  quotationNo,
  initialLines,
  initialNotes,
  initialDeliveryTermMode,
  initialRequiredPaymentPercent,
  initialDispatchMinDays,
  initialDispatchMaxDays,
}: {
  customers: Customer[];
  products: Product[];
  companies?: CompanyOption[];
  selectedCompanyId?: string;
  defaultCustomerId?: string;
  salesExecutives: SalesExecutive[];
  defaultSalesUserId: string;
  mode?: "create" | "revise";
  quotationId?: string;
  quotationNo?: string;
  initialLines?: LineDraft[];
  initialNotes?: string;
  initialDeliveryTermMode?: DeliveryTermMode;
  initialRequiredPaymentPercent?: number | null;
  initialDispatchMinDays?: number | null;
  initialDispatchMaxDays?: number | null;
}) {
  const isRevise = mode === "revise";
  const router = useRouter();
  const { update } = useSession();
  const companySelected = isRevise || Boolean(selectedCompanyId);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [salesUserId, setSalesUserId] = useState(
    salesExecutives.some((user) => user.id === defaultSalesUserId)
      ? defaultSalesUserId
      : (salesExecutives[0]?.id ?? defaultSalesUserId),
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [deliveryTermMode, setDeliveryTermMode] = useState<DeliveryTermMode>(
    initialDeliveryTermMode ?? "SUBJECT_TO_AVAILABILITY",
  );
  const [requiredPaymentPercent, setRequiredPaymentPercent] = useState(
    String(initialRequiredPaymentPercent ?? 30),
  );
  const [dispatchMinDays, setDispatchMinDays] = useState(
    String(initialDispatchMinDays ?? 5),
  );
  const [dispatchMaxDays, setDispatchMaxDays] = useState(
    String(initialDispatchMaxDays ?? 7),
  );
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines && initialLines.length > 0 ? initialLines : [emptyProductLine()],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const prevCompanyIdRef = useRef(selectedCompanyId);

  useEffect(() => {
    setCompanyLoading(false);

    if (
      !isRevise &&
      selectedCompanyId &&
      selectedCompanyId !== prevCompanyIdRef.current
    ) {
      prevCompanyIdRef.current = selectedCompanyId;
      setCustomerId(defaultCustomerId ?? "");
      setSalesUserId(
        salesExecutives.some((user) => user.id === defaultSalesUserId)
          ? defaultSalesUserId
          : (salesExecutives[0]?.id ?? defaultSalesUserId),
      );
      setLines([emptyProductLine()]);
    }
  }, [
    selectedCompanyId,
    customers,
    products,
    salesExecutives,
    defaultCustomerId,
    defaultSalesUserId,
    isRevise,
  ]);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.customerName })),
    [customers],
  );

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: `${product.displayName}${product.currentPrice ? "" : " (price not configured)"}`,
      })),
    [products],
  );

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
  const deliveryTermNote = getDeliveryTermNote({
    mode: deliveryTermMode,
    requiredPaymentPercent:
      deliveryTermMode === "READY_STOCK" ? 100 : Number(requiredPaymentPercent),
    dispatchMinDays: Number(dispatchMinDays),
    dispatchMaxDays: Number(dispatchMaxDays),
  });

  async function handleCompanyChange(companyId: string) {
    if (!companyId || companyId === selectedCompanyId) {
      return;
    }

    setCompanyLoading(true);
    setError("");

    try {
      await update({ activeCompanyId: companyId });
    } catch {
      setCompanyLoading(false);
      setError("Unable to switch company. Please try again.");
      return;
    }

    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (defaultCustomerId) {
      params.set("customerId", defaultCustomerId);
    }

    window.location.assign(`/sales/quotations/new?${params.toString()}`);
  }

  if (companySelected && products.length === 0) {
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
    setLines((current) => [...current, emptyProductLine()]);
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

    if (!isRevise && !selectedCompanyId) {
      setError("Select a company before saving the quotation.");
      return;
    }

    if (!isRevise && !customerId) {
      setError("Select a customer before saving the quotation.");
      return;
    }

    const incompleteLine = lines.find((line) => !line.productId || !line.qty || !line.rate);
    if (incompleteLine) {
      setError("Complete all line items with product, quantity, and rate.");
      return;
    }

    const invalidLine = lines.find((line) => {
      const product = products.find((item) => item.id === line.productId);
      return !product?.currentPrice;
    });
    if (invalidLine) {
      setError("Selected product does not have a configured price for this company.");
      return;
    }

    // Open the WhatsApp tab synchronously on click (before any await) so the
    // browser does not block it as a popup. We redirect it once we have the
    // saved quotation, or close it if saving fails / there's no mobile number.
    const shareWindow = send ? window.open("", "_blank") : null;

    setLoading(true);

    const mappedLines = lines.map((line) => ({
      productId: line.productId,
      qty: Number(line.qty),
      rate: Number(line.rate),
    }));

    const endpoint = isRevise ? `/api/quotations/${quotationId}/revise` : "/api/quotations";
    const deliveryTerms = {
      deliveryTermMode,
      requiredPaymentPercent:
        deliveryTermMode === "ADVANCE_BOOKING"
          ? Number(requiredPaymentPercent)
          : deliveryTermMode === "READY_STOCK"
            ? 100
            : undefined,
      dispatchMinDays:
        deliveryTermMode === "ADVANCE_BOOKING" ? Number(dispatchMinDays) : undefined,
      dispatchMaxDays:
        deliveryTermMode === "ADVANCE_BOOKING" ? Number(dispatchMaxDays) : undefined,
    };
    const basePayload = isRevise
      ? { notes: notes || undefined, send, lines: mappedLines, ...deliveryTerms }
      : {
          customerId,
          salesUserId,
          notes: notes || undefined,
          send,
          lines: mappedLines,
          ...deliveryTerms,
        };

    let response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });
    let data = await response.json();

    if (response.status === 409 && data.code === "QUOTATION_WARNINGS_REQUIRED") {
      const warnings = Array.isArray(data.details?.warnings)
        ? data.details.warnings
        : [];
      const confirmed = window.confirm(
        `${warnings.map((warning: { message?: string }) => `• ${warning.message ?? "Review quotation warning."}`).join("\n\n")}\n\nProceed and save this quotation?`,
      );
      if (!confirmed) {
        shareWindow?.close();
        setLoading(false);
        return;
      }

      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, proceedWithWarnings: true }),
      });
      data = await response.json();
    }
    setLoading(false);

    if (!response.ok) {
      shareWindow?.close();
      setError(data.message ?? "Unable to save quotation.");
      return;
    }

    if (shareWindow) {
      const waUrl: string | null = data.whatsappUrl ?? null;
      if (waUrl) {
        shareWindow.location.href = waUrl;
      } else {
        shareWindow.close();
      }
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

      {!isRevise ? (
        <Card className="border-amber-300 bg-amber-50/60 shadow-sm">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Company *</CardTitle>
                <p className="mt-1 text-sm text-amber-900/80">
                  Select the company for this quotation. PCM quotations can only be created by Super
                  Admin.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="quotation-company">Quotation company</Label>
              <select
                id="quotation-company"
                value={selectedCompanyId ?? ""}
                disabled={companyLoading}
                onChange={(event) => handleCompanyChange(event.target.value)}
                className="flex h-11 w-full max-w-md rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-slate-900"
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.code})
                  </option>
                ))}
              </select>
            </div>
            {!selectedCompanyId ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Choose the correct company before entering customer and line item details.</p>
              </div>
            ) : (
              <p className="text-sm font-medium text-emerald-800">
                Quotation will be created for {selectedCompany?.name} ({selectedCompany?.code}).
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <fieldset
        disabled={!companySelected}
        className={!companySelected ? "space-y-6 opacity-60" : "space-y-6"}
      >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            {isRevise ? (
              <>
                <Label htmlFor="customer">Customer</Label>
                <Input id="customer" value={selectedCustomer?.customerName ?? ""} readOnly />
              </>
            ) : (
              <TypeaheadSelect
                id="customer"
                label="Customer"
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Type customer name..."
                required
              />
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
                  <TypeaheadSelect
                    label="Product"
                    options={productOptions}
                    value={line.productId}
                    onChange={(productId) => handleProductChange(index, productId)}
                    placeholder="Type product name..."
                    required
                  />
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
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                      }
                    }}
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
          <CardTitle className="text-base">Delivery Terms</CardTitle>
          <p className="text-sm text-slate-500">
            Select how material availability and booking will be stated on the quotation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                value: "ADVANCE_BOOKING" as const,
                title: "Advance Booking",
                description: "Booking against advance payment with a dispatch window.",
              },
              {
                value: "READY_STOCK" as const,
                title: "Ready Stock",
                description: "100% payment required. Offered from ready stock.",
              },
              {
                value: "SUBJECT_TO_AVAILABILITY" as const,
                title: "Subject to Availability",
                description: "No booking commitment until material availability is confirmed.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                  deliveryTermMode === option.value
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="deliveryTermMode"
                  value={option.value}
                  checked={deliveryTermMode === option.value}
                  onChange={() => setDeliveryTermMode(option.value)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block font-medium text-slate-900">{option.title}</span>
                  <span className="mt-1 block text-sm text-slate-500">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {deliveryTermMode === "ADVANCE_BOOKING" ? (
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="requiredPaymentPercent">Advance payment (%)</Label>
                <Input
                  id="requiredPaymentPercent"
                  type="number"
                  min="1"
                  max="100"
                  step="any"
                  value={requiredPaymentPercent}
                  onChange={(event) => setRequiredPaymentPercent(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispatchMinDays">Dispatch from (days)</Label>
                <Input
                  id="dispatchMinDays"
                  type="number"
                  min="0"
                  step="1"
                  value={dispatchMinDays}
                  onChange={(event) => setDispatchMinDays(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispatchMaxDays">Dispatch within (days)</Label>
                <Input
                  id="dispatchMaxDays"
                  type="number"
                  min="0"
                  step="1"
                  value={dispatchMaxDays}
                  onChange={(event) => setDispatchMaxDays(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          {deliveryTermMode === "READY_STOCK" ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Payment required for booking: 100% (fixed)
            </p>
          ) : null}

          {deliveryTermMode === "SUBJECT_TO_AVAILABILITY" ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Booking is disabled for this quotation until availability is confirmed.</p>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Generated delivery note
            </p>
            <p className="mt-2 text-sm text-slate-700">{deliveryTermNote}</p>
          </div>
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
      </fieldset>
    </div>
  );
}
