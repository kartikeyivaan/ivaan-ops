"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseApiJson } from "@/lib/api-response";
import { calculateTotalPurchaseCost } from "@/lib/inventory";
import { evaluateCellInput } from "@/lib/cell-formula";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaInput, resolveFormulaField } from "@/components/ui/formula-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";

type Company = { id: string; name: string; code: string };
type Product = { id: string; displayName: string; gstRate: number };
type Warehouse = { id: string; name: string; companyId: string };
type Vendor = { id: string; vendorName: string };

export function IncomingCreateForm({
  companies,
  products,
  warehouses,
  vendors,
  defaultCompanyId,
  onCreated,
}: {
  companies: Company[];
  products: Product[];
  warehouses: Warehouse[];
  vendors: Vendor[];
  defaultCompanyId: string;
  onCreated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const initialCompanyId = defaultCompanyId || companies[0]?.id || "";
  const initialWarehouses = warehouses.filter((warehouse) => warehouse.companyId === initialCompanyId);

  const [form, setForm] = useState({
    companyId: initialCompanyId,
    warehouseId: initialWarehouses[0]?.id ?? "",
    vendorId: "",
    purchaseInvoiceNo: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    productId: "",
    quantity: "",
    unitPurchaseRate: "",
    transportCharges: "0",
    commissionCharges: "0",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const companyWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.companyId === form.companyId),
    [warehouses, form.companyId],
  );

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.displayName })),
    [products],
  );

  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.vendorName })),
    [vendors],
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [products, form.productId],
  );

  const totalPurchaseCost = useMemo(() => {
    const quantity = evaluateCellInput(form.quantity).value;
    const unitPurchaseRate = evaluateCellInput(form.unitPurchaseRate).value;
    if (quantity === null || quantity <= 0 || unitPurchaseRate === null) {
      return 0;
    }

    return calculateTotalPurchaseCost({
      quantity,
      unitPurchaseRate,
      gstRate: selectedProduct?.gstRate ?? 0,
      transportCharges: evaluateCellInput(form.transportCharges).value ?? 0,
      commissionCharges: evaluateCellInput(form.commissionCharges).value ?? 0,
    });
  }, [
    form.quantity,
    form.unitPurchaseRate,
    form.transportCharges,
    form.commissionCharges,
    selectedProduct?.gstRate,
  ]);

  function updateCompany(companyId: string) {
    const nextWarehouses = warehouses.filter((warehouse) => warehouse.companyId === companyId);
    setForm((current) => ({
      ...current,
      companyId,
      warehouseId: nextWarehouses[0]?.id ?? "",
    }));
  }

  async function createIncoming(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (!form.productId || !products.some((product) => product.id === form.productId)) {
      setLoading(false);
      setError("Select a valid product from the list.");
      return;
    }

    if (form.vendorId && !vendors.some((vendor) => vendor.id === form.vendorId)) {
      setLoading(false);
      setError("Select a valid vendor from the list.");
      return;
    }

    const quantityResult = resolveFormulaField(form.quantity, "Expected quantity");
    const unitRateResult = resolveFormulaField(form.unitPurchaseRate, "Per unit purchase rate");
    const transportResult = resolveFormulaField(
      form.transportCharges.trim() ? form.transportCharges : "0",
      "Transport charges",
    );
    const commissionResult = resolveFormulaField(
      form.commissionCharges.trim() ? form.commissionCharges : "0",
      "Commission charges",
    );

    const fieldError =
      quantityResult.error ??
      unitRateResult.error ??
      transportResult.error ??
      commissionResult.error;

    if (fieldError) {
      setLoading(false);
      setError(fieldError);
      return;
    }

    if ((quantityResult.value ?? 0) <= 0) {
      setLoading(false);
      setError("Expected quantity must be greater than zero.");
      return;
    }

    const response = await fetch("/api/inventory/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: form.companyId,
        warehouseId: form.warehouseId,
        vendorId: form.vendorId || undefined,
        purchaseInvoiceNo: form.purchaseInvoiceNo || undefined,
        purchaseDate: form.purchaseDate,
        productId: form.productId,
        quantity: quantityResult.value,
        unitPurchaseRate: unitRateResult.value,
        transportCharges: transportResult.value ?? 0,
        commissionCharges: commissionResult.value ?? 0,
      }),
    });

    const data = await parseApiJson<{ message?: string }>(response);
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to create incoming lot.");
      return;
    }

    setForm((current) => ({
      ...current,
      quantity: "",
      purchaseInvoiceNo: "",
      unitPurchaseRate: "",
      transportCharges: "0",
      commissionCharges: "0",
    }));

    if (onCreated) {
      await onCreated();
    } else {
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create incoming lot</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={createIncoming} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Incoming Company</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={form.companyId}
              onChange={(e) => updateCompany(e.target.value)}
              required
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Incoming Warehouse</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              required
            >
              {companyWarehouses.length === 0 ? (
                <option value="">No warehouse for selected company</option>
              ) : (
                companyWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <TypeaheadSelect
            label="Product"
            options={productOptions}
            value={form.productId}
            onChange={(productId) => setForm({ ...form, productId })}
            placeholder="Type product name here"
            required
          />
          <TypeaheadSelect
            label="Vendor"
            options={vendorOptions}
            value={form.vendorId}
            onChange={(vendorId) => setForm({ ...form, vendorId })}
            placeholder="Type vendor name..."
            allowEmpty
            emptyLabel="No vendor"
          />
          <div className="space-y-2">
            <Label>Purchase invoice no.</Label>
            <Input
              value={form.purchaseInvoiceNo}
              onChange={(e) => setForm({ ...form, purchaseInvoiceNo: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Purchase date</Label>
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              required
            />
          </div>
          <FormulaInput
            label="Expected quantity"
            value={form.quantity}
            onChange={(quantity) => setForm({ ...form, quantity })}
            placeholder="100 or =20*33"
            required
          />
          <FormulaInput
            label="Per unit purchase rate"
            value={form.unitPurchaseRate}
            onChange={(unitPurchaseRate) => setForm({ ...form, unitPurchaseRate })}
            placeholder="8500 or =100*85"
            required
          />
          <FormulaInput
            label="Transport charges"
            value={form.transportCharges}
            onChange={(transportCharges) => setForm({ ...form, transportCharges })}
            placeholder="0 or =500+250"
          />
          <FormulaInput
            label="Commission charges"
            value={form.commissionCharges}
            onChange={(commissionCharges) => setForm({ ...form, commissionCharges })}
            placeholder="0 or =100*10"
          />
          <div className="space-y-2 md:col-span-2">
            <Label>Total purchase cost</Label>
            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
              {totalPurchaseCost.toLocaleString("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-slate-500">
              Total = (quantity × unit rate) + GST + transport + commission
              {selectedProduct
                ? ` (GST at ${selectedProduct.gstRate}% on quantity × unit rate).`
                : " (GST uses the selected product's GST rate)."}
            </p>
          </div>
          {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading || companyWarehouses.length === 0}>
              {loading ? "Saving..." : "Create incoming lot"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
