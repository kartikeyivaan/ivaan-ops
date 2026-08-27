"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
  Truck,
  ArrowRightLeft,
  Send,
  ClipboardCheck,
  AlertTriangle,
  PackagePlus,
  QrCode,
  PackageSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductStockSummary } from "@/lib/inventory-service";

type Warehouse = { id: string; name: string };

export function StockOverview({
  initialStock,
  warehouses,
  scopeLabel,
  canReceiveIncoming,
  canViewDamaged,
  canManualStock,
}: {
  initialStock: ProductStockSummary[];
  warehouses: Warehouse[];
  scopeLabel?: string;
  canReceiveIncoming: boolean;
  canViewDamaged?: boolean;
  canManualStock?: boolean;
}) {
  const [stock, setStock] = useState(initialStock);
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (warehouseId) params.set("warehouseId", warehouseId);

    const response = await fetch(`/api/inventory/stock?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) setStock(data);
  }

  const totals = stock.reduce(
    (acc, row) => ({
      available: acc.available + row.consolidated.availableStock,
      incoming: acc.incoming + row.consolidated.incomingStock,
      booked: acc.booked + row.consolidated.bookedStock,
      damaged: acc.damaged + row.consolidated.damagedStock,
    }),
    { available: 0, incoming: 0, booked: 0, damaged: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            {scopeLabel
              ? `Combined stock across ${scopeLabel}. Warehouse columns are prefixed by company code.`
              : "Lot-based stock with warehouse split and consolidated totals."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReceiveIncoming ? (
            <Button asChild>
              <Link href="/inventory/incoming">
                <Truck className="mr-2 h-4 w-4" />
                Receive Incoming
              </Link>
            </Button>
          ) : null}
          {canManualStock ? (
            <Button variant="outline" asChild>
              <Link href="/inventory/manual-stock">
                <PackagePlus className="mr-2 h-4 w-4" />
                Manual Stock Entry
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/inventory/audits">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Audits
            </Link>
          </Button>
          {canViewDamaged ? (
            <Button variant="outline" asChild>
              <Link href="/inventory/damaged">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Damaged Items
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/inventory/transfers">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfers
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/dispatches">
              <Send className="mr-2 h-4 w-4" />
              Dispatches
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/ledger">
              <Package className="mr-2 h-4 w-4" />
              Ledger
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/qr-history">
              <QrCode className="mr-2 h-4 w-4" />
              QR History
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/product-movements">
              <PackageSearch className="mr-2 h-4 w-4" />
              Product In / Out
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Available", value: totals.available },
          { label: "Incoming", value: totals.incoming },
          { label: "Booked", value: totals.booked },
          { label: "Damaged", value: totals.damaged },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search stock</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="q">Product / brand</Label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouseId">Warehouse</Label>
            <select
              id="warehouseId"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Loading..." : "Apply filters"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Incoming</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Committed</TableHead>
                <TableHead>Damaged</TableHead>
                {warehouses.map((warehouse) => (
                  <TableHead key={warehouse.id}>{warehouse.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="font-medium">{row.displayName}</TableCell>
                  <TableCell>{row.categoryName}</TableCell>
                  <TableCell>{row.consolidated.availableStock}</TableCell>
                  <TableCell>{row.consolidated.incomingStock}</TableCell>
                  <TableCell>{row.consolidated.bookedStock}</TableCell>
                  <TableCell>{row.consolidated.committedStock}</TableCell>
                  <TableCell>{row.consolidated.damagedStock}</TableCell>
                  {warehouses.map((warehouse) => {
                    const wh = row.warehouses.find((w) => w.warehouseId === warehouse.id);
                    return (
                      <TableCell key={warehouse.id}>
                        {wh
                          ? wh.committedStock > 0
                            ? `${wh.availableStock} (${wh.committedStock} committed)`
                            : wh.availableStock
                          : 0}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
