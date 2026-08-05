"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SafetyStockManager({ rows, warehouses, products }: {
  rows: Array<{ id: string; safetyQty: string | number; effectiveFrom: string; warehouse: { name: string }; product: { displayName: string } }>;
  warehouses: Array<{ id: string; name: string }>;
  products: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [safetyQty, setSafetyQty] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  async function save() {
    const response = await fetch("/api/inventory/safety-stock", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, productId, safetyQty, effectiveFrom }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message ?? "Unable to save.");
    setError(""); router.refresh();
  }
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Safety Stock</h1><p className="text-sm text-slate-500">Set product buffers per warehouse.</p></div>
    <Card><CardHeader><CardTitle className="text-base">Set safety quantity</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label>Warehouse</Label><select className="h-10 w-full rounded-md border bg-white px-3" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="space-y-1"><Label>Product</Label><select className="h-10 w-full rounded-md border bg-white px-3" value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select></div>
      <div className="space-y-1"><Label>Safety quantity</Label><Input type="number" min="0" step="any" value={safetyQty} onChange={(e) => setSafetyQty(e.target.value)} /></div>
      <div className="space-y-1"><Label>Effective from</Label><Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
      <Button onClick={save} disabled={!warehouseId || !productId}>Save</Button>
    </CardContent></Card>
    <div className="grid gap-3 md:grid-cols-2">{rows.map((row) => <Card key={row.id}><CardContent className="flex justify-between gap-3 pt-5"><div><p className="font-medium">{row.product.displayName}</p><p className="text-sm text-slate-500">{row.warehouse.name}</p></div><p className="text-lg font-semibold text-emerald-700">{Number(row.safetyQty)}</p></CardContent></Card>)}</div>
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
  </div>;
}
