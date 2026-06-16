"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Product = {
  id: string;
  displayName: string;
  serialTracking: boolean;
};

type SourceWarehouse = { id: string; name: string };

type DestinationWarehouse = {
  id: string;
  name: string;
  company: { id: string; name: string; code: string };
};

type LineDraft = {
  productId: string;
  qty: string;
  serialIds: string[];
};

export function TransferForm({
  sourceWarehouses,
  destinationWarehouses,
  products,
  canViewSerials,
}: {
  sourceWarehouses: SourceWarehouse[];
  destinationWarehouses: DestinationWarehouse[];
  products: Product[];
  canViewSerials: boolean;
}) {
  const router = useRouter();
  const [fromWarehouseId, setFromWarehouseId] = useState(sourceWarehouses[0]?.id ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(
    destinationWarehouses.find((w) => w.id !== sourceWarehouses[0]?.id)?.id ?? "",
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { productId: products[0]?.id ?? "", qty: "", serialIds: [] },
  ]);
  const [availableSerials, setAvailableSerials] = useState<
    Record<number, { id: string; serialNumber: string }[]>
  >({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canViewSerials) return;

    lines.forEach((line, index) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product?.serialTracking || !fromWarehouseId) return;

      const params = new URLSearchParams({
        warehouseId: fromWarehouseId,
        productId: line.productId,
      });

      fetch(`/api/inventory/transfers/serials?${params.toString()}`)
        .then((response) => (response.ok ? response.json() : []))
        .then((data) => {
          setAvailableSerials((current) => ({ ...current, [index]: data }));
        });
    });
  }, [lines, fromWarehouseId, products, canViewSerials]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, ...patch, ...(patch.productId ? { serialIds: [] } : {}) }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { productId: products[0]?.id ?? "", qty: "", serialIds: [] },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      fromWarehouseId,
      toWarehouseId,
      notes: notes || undefined,
      lines: lines.map((line) => ({
        productId: line.productId,
        qty: Number(line.qty),
        serialIds: line.serialIds.length ? line.serialIds : undefined,
      })),
    };

    const response = await fetch("/api/inventory/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to create transfer.");
      return;
    }

    router.push(`/inventory/transfers/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="px-0">
        <Link href="/inventory/transfers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to transfers
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">New transfer</h1>
        <p className="text-sm text-slate-500">
          Create a draft transfer from the active company warehouse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From warehouse</Label>
                <select
                  className="flex h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value)}
                  required
                >
                  {sourceWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>To warehouse</Label>
                <select
                  className="flex h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  required
                >
                  {destinationWarehouses
                    .filter((warehouse) => warehouse.id !== fromWarehouseId)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.company.code} · {warehouse.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional transfer notes"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Line items</h2>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add line
                </Button>
              </div>

              {lines.map((line, index) => {
                const product = products.find((item) => item.id === line.productId);
                const serialOptions = availableSerials[index] ?? [];

                return (
                  <Card key={index}>
                    <CardContent className="space-y-4 pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid flex-1 gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Product</Label>
                            <select
                              className="flex h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                              value={line.productId}
                              onChange={(e) =>
                                updateLine(index, { productId: e.target.value, serialIds: [] })
                              }
                              required
                            >
                              {products.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.displayName}
                                  {item.serialTracking ? " (serial)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              step="any"
                              className="h-12 text-lg"
                              value={line.qty}
                              onChange={(e) => updateLine(index, { qty: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        {lines.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>

                      {product?.serialTracking && canViewSerials ? (
                        <div className="space-y-2">
                          <Label>Select serial numbers</Label>
                          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">
                            {serialOptions.length === 0 ? (
                              <p className="text-sm text-slate-500">No available serials.</p>
                            ) : (
                              serialOptions.map((serial) => (
                                <label key={serial.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={line.serialIds.includes(serial.id)}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...line.serialIds, serial.id]
                                        : line.serialIds.filter((id) => id !== serial.id);
                                      updateLine(index, { serialIds: next });
                                    }}
                                  />
                                  {serial.serialNumber}
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              {loading ? "Creating..." : "Create draft transfer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
