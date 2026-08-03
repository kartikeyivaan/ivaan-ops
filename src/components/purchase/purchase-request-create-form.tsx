"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import {
  PURCHASE_REQUEST_PRIORITIES,
  PURCHASE_REQUEST_PRIORITY_LABELS,
} from "@/lib/purchase-request-constants";

type Company = { id: string; name: string; code: string };
type Warehouse = { id: string; name: string; companyId: string };
type ProductOption = {
  id: string;
  displayName: string;
  categoryName: string;
  brandName: string;
  gstRate: number;
};
type Category = { id: string; name: string };

type LineDraft = {
  key: string;
  mode: "existing" | "new";
  productId: string;
  requestedQty: string;
  targetDate: string;
  priority: string;
  remarks: string;
  newCategoryId: string;
  newBrandName: string;
  newTechnologyName: string;
  newCapacity: string;
  newCapacityUnit: string;
  newGstRate: string;
};

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    mode: "existing",
    productId: "",
    requestedQty: "",
    targetDate: "",
    priority: "NORMAL",
    remarks: "",
    newCategoryId: "",
    newBrandName: "",
    newTechnologyName: "",
    newCapacity: "",
    newCapacityUnit: "NOS",
    newGstRate: "18",
  };
}

export function PurchaseRequestCreateForm({
  companies,
  warehouses,
  products,
  categories,
  defaultCompanyId,
}: {
  companies: Company[];
  warehouses: Warehouse[];
  products: ProductOption[];
  categories: Category[];
  defaultCompanyId: string;
}) {
  const router = useRouter();
  const initialCompanyId = defaultCompanyId || companies[0]?.id || "";
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [warehouseId, setWarehouseId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const companyWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.companyId === companyId),
    [warehouses, companyId],
  );

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.displayName })),
    [products],
  );

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.name !== "Kit")
        .map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        companyId,
        warehouseId: warehouseId || null,
        remarks: remarks || null,
        lines: lines.map((line) => {
          if (line.mode === "new") {
            return {
              newProduct: {
                categoryId: line.newCategoryId,
                brandName: line.newBrandName,
                technologyName: line.newTechnologyName || undefined,
                capacity: Number(line.newCapacity),
                capacityUnit: line.newCapacityUnit,
                gstRate: Number(line.newGstRate),
              },
              requestedQty: Number(line.requestedQty),
              targetDate: line.targetDate || null,
              priority: line.priority,
              remarks: line.remarks || null,
            };
          }

          return {
            productId: line.productId,
            requestedQty: Number(line.requestedQty),
            targetDate: line.targetDate || null,
            priority: line.priority,
            remarks: line.remarks || null,
          };
        }),
      };

      const response = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<{ id?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message || "Could not create purchase request.");
      }
      router.push(`/purchase/requests/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create purchase request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyId">Company</Label>
            <select
              id="companyId"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setWarehouseId("");
              }}
              required
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouseId">Target warehouse (optional)</Label>
            <select
              id="warehouseId"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">None</option>
              {companyWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Input
              id="remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Why this purchase is needed"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Items needed</h2>
          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>
            Add line
          </Button>
        </div>

        {lines.map((line, index) => {
          const selectedProduct = products.find((product) => product.id === line.productId);
          return (
            <Card key={line.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Line {index + 1}</CardTitle>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  >
                    Remove
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={line.mode === "existing" ? "default" : "outline"}
                    onClick={() => updateLine(line.key, { mode: "existing" })}
                  >
                    Select existing product
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={line.mode === "new" ? "default" : "outline"}
                    onClick={() => updateLine(line.key, { mode: "new", productId: "" })}
                  >
                    Create new product
                  </Button>
                </div>

                {line.mode === "existing" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <TypeaheadSelect
                      label="Product"
                      options={productOptions}
                      value={line.productId}
                      onChange={(value) => updateLine(line.key, { productId: value })}
                      required
                    />
                    {selectedProduct ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <div>Type: {selectedProduct.categoryName}</div>
                        <div>Brand: {selectedProduct.brandName}</div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Type (category)</Label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={line.newCategoryId}
                        onChange={(event) => updateLine(line.key, { newCategoryId: event.target.value })}
                        required
                      >
                        <option value="">Select type</option>
                        {categoryOptions.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Brand</Label>
                      <Input
                        value={line.newBrandName}
                        onChange={(event) => updateLine(line.key, { newBrandName: event.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Technology (optional)</Label>
                      <Input
                        value={line.newTechnologyName}
                        onChange={(event) => updateLine(line.key, { newTechnologyName: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Capacity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={line.newCapacity}
                        onChange={(event) => updateLine(line.key, { newCapacity: event.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Capacity unit</Label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={line.newCapacityUnit}
                        onChange={(event) => updateLine(line.key, { newCapacityUnit: event.target.value })}
                      >
                        {["WP", "KW", "KVA", "NOS", "METER"].map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>GST %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={line.newGstRate}
                        onChange={(event) => updateLine(line.key, { newGstRate: event.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Request qty</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.requestedQty}
                      onChange={(event) => updateLine(line.key, { requestedQty: event.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Target date</Label>
                    <Input
                      type="date"
                      value={line.targetDate}
                      onChange={(event) => updateLine(line.key, { targetDate: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={line.priority}
                      onChange={(event) => updateLine(line.key, { priority: event.target.value })}
                    >
                      {PURCHASE_REQUEST_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PURCHASE_REQUEST_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Line remarks</Label>
                    <Input
                      value={line.remarks}
                      onChange={(event) => updateLine(line.key, { remarks: event.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit request"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/purchase/requests")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
