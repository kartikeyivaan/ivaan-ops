"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Camera,
  Loader2,
  PackageSearch,
  QrCode,
} from "lucide-react";
import { SerialScanner } from "@/components/inventory/serial-scanner";
import { Badge } from "@/components/ui/badge";
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
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import { normalizeSerialNumber } from "@/lib/inventory";
import type { SerialPhysicalHistory } from "@/lib/serial-history-service";
import type { ProductPhysicalLedgerResult } from "@/lib/product-physical-ledger-service";
import { cn } from "@/lib/utils";

type ProductOption = { id: string; displayName: string };
type WarehouseOption = { id: string; name: string };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatQty(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function statusBadgeVariant(
  status: string,
): "default" | "success" | "warning" | "danger" {
  if (status === "AVAILABLE") return "success";
  if (status === "DISPATCHED" || status === "REMOVED") return "default";
  if (status === "DAMAGED" || status === "DAMAGE_PENDING") return "danger";
  if (status === "BOOKED") return "warning";
  return "default";
}

function directionBadge(direction: "IN" | "OUT" | "STATUS" | "NEUTRAL") {
  if (direction === "IN") {
    return (
      <Badge variant="success" className="gap-1">
        <ArrowDownToLine className="h-3 w-3" />
        IN
      </Badge>
    );
  }
  if (direction === "OUT") {
    return (
      <Badge variant="danger" className="gap-1">
        <ArrowUpFromLine className="h-3 w-3" />
        OUT
      </Badge>
    );
  }
  return <Badge variant="default">{direction}</Badge>;
}

function TabNav({ active }: { active: "qr" | "product" }) {
  return (
    <div className="inline-flex h-10 items-center rounded-md bg-slate-100 p-1 text-slate-500">
      <Link
        href="/inventory/qr-history"
        className={cn(
          "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
          active === "qr"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900",
        )}
      >
        <QrCode className="mr-2 h-4 w-4" />
        QR History
      </Link>
      <Link
        href="/inventory/product-movements"
        className={cn(
          "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
          active === "product"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900",
        )}
      >
        <PackageSearch className="mr-2 h-4 w-4" />
        Product In / Out
      </Link>
    </div>
  );
}

function QrHistoryPanel({ canScan }: { canScan: boolean }) {
  const [serialInput, setSerialInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SerialPhysicalHistory | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookup = useCallback(async (raw: string) => {
    const serialNumber = normalizeSerialNumber(raw);
    if (!serialNumber) {
      setError("Enter or scan a serial number.");
      setHistory(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/inventory/serials/history?serialNumber=${encodeURIComponent(serialNumber)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setHistory(null);
        setError(data.message ?? "Serial not found.");
        return;
      }
      setHistory(data as SerialPhysicalHistory);
    } catch {
      setHistory(null);
      setError("Failed to load QR history.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="serial-lookup">Serial / QR</Label>
              <Input
                id="serial-lookup"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookup(serialInput);
                  }
                }}
                placeholder="Paste or type serial number"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void lookup(serialInput)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Look up
              </Button>
              {canScan ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Scan
                </Button>
              ) : null}
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {history ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {history.serial.serialNumber}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Product</p>
                <p className="font-medium text-slate-900">
                  {history.serial.product.displayName}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <Badge variant={statusBadgeVariant(history.serial.status)}>
                  {history.serial.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Current warehouse</p>
                <p className="font-medium text-slate-900">
                  {history.serial.currentWarehouse.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Origin lot</p>
                <Link
                  href={`/inventory/incoming/${history.serial.lot.id}`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {history.serial.lot.lotNumber}
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Physical movement history
              </CardTitle>
              <p className="text-sm text-slate-500">
                Oldest to newest. Sales booking is excluded.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {history.events.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No movements found.</p>
              ) : (
                <ol className="space-y-0 border-t border-slate-100">
                  {history.events.map((event, index) => (
                    <li
                      key={event.id}
                      className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-6"
                    >
                      <div className="flex w-8 shrink-0 flex-col items-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {index + 1}
                        </span>
                        {index < history.events.length - 1 ? (
                          <span className="mt-1 w-px flex-1 bg-slate-200" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {event.label}
                          </p>
                          {directionBadge(event.direction)}
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(event.occurredAt)}
                          {event.actorName ? ` · ${event.actorName}` : ""}
                        </p>
                        <p className="text-sm text-slate-600">
                          {[
                            event.fromWarehouseName &&
                              `From ${event.fromWarehouseName}`,
                            event.toWarehouseName &&
                              `To ${event.toWarehouseName}`,
                            event.referenceNumber,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {event.notes ? (
                          <p className="text-sm text-slate-500">{event.notes}</p>
                        ) : null}
                        {event.href ? (
                          <Link
                            href={event.href}
                            className="text-sm font-medium text-emerald-700 hover:underline"
                          >
                            Open record
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan QR for history"
        onScan={async (serials) => {
          const first = serials[0];
          if (!first) {
            return { ok: false, reason: "No serial detected." };
          }
          setSerialInput(normalizeSerialNumber(first));
          setScannerOpen(false);
          await lookup(first);
          return { ok: true, message: normalizeSerialNumber(first) };
        }}
      />
    </div>
  );
}

function ProductMovementsPanel({
  products,
  warehouses,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
}) {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProductPhysicalLedgerResult | null>(
    null,
  );

  async function load() {
    if (!productId) {
      setError("Select a product.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ productId });
      if (warehouseId) params.set("warehouseId", warehouseId);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(
        `/api/inventory/product-movements?${params.toString()}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(data.message ?? "Failed to load movements.");
        return;
      }
      setResult(data as ProductPhysicalLedgerResult);
    } catch {
      setResult(null);
      setError("Failed to load product movements.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TypeaheadSelect
              label="Product"
              required
              options={products.map((p) => ({
                value: p.id,
                label: p.displayName,
              }))}
              value={productId}
              onChange={setProductId}
              placeholder="Search product..."
            />
            <TypeaheadSelect
              label="Warehouse"
              allowEmpty
              emptyLabel="All warehouses"
              options={warehouses.map((w) => ({
                value: w.id,
                label: w.name,
              }))}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Optional filter..."
            />
            <div className="space-y-2">
              <Label htmlFor="from-date">From date</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">To date</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Show movements
            </Button>
            <p className="text-xs text-slate-500">
              Physical ledger only (inward, transfer, dispatch, damage, adjust).
              Use a warehouse filter for the clearest mismatch running balance.
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total IN</p>
                <p className="text-xl font-semibold text-emerald-700">
                  {formatQty(result.totalIn)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total OUT</p>
                <p className="text-xl font-semibold text-rose-700">
                  {formatQty(result.totalOut)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">
                  Closing{result.warehouseId ? " (warehouse)" : " (company)"}
                </p>
                <p className="text-xl font-semibold text-slate-900">
                  {formatQty(result.closingBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                {result.product.displayName}
              </CardTitle>
              <p className="text-sm text-slate-500">
                Oldest to newest · {result.entries.length} transactions
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.entries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-slate-500"
                      >
                        No physical transactions in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTime(entry.occurredAt)}
                        </TableCell>
                        <TableCell>{entry.transactionType}</TableCell>
                        <TableCell>{directionBadge(entry.direction)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={cn(
                              entry.signedQty > 0 && "text-emerald-700",
                              entry.signedQty < 0 && "text-rose-700",
                            )}
                          >
                            {entry.signedQty > 0 ? "+" : ""}
                            {formatQty(entry.signedQty)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {entry.fromWarehouse?.name ?? "—"}
                        </TableCell>
                        <TableCell>{entry.toWarehouse?.name ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatQty(entry.runningBalance)}
                        </TableCell>
                        <TableCell>{entry.createdBy.name}</TableCell>
                        <TableCell className="max-w-[14rem] truncate text-slate-500">
                          {entry.notes ?? entry.lot?.lotNumber ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export function QrHistoryWorkbench({
  activeTab,
  products,
  warehouses,
  canScanSerials,
}: {
  activeTab: "qr" | "product";
  products: ProductOption[];
  warehouses: WarehouseOption[];
  canScanSerials: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
          <Link href="/inventory">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">
          {activeTab === "qr" ? "QR History" : "Product In / Out"}
        </h1>
        <p className="text-sm text-slate-500">
          {activeTab === "qr"
            ? "Trace a single serial’s physical movements from first receive to latest."
            : "Inspect product-wise physical ledger rows when stock counts do not match."}
        </p>
      </div>

      <TabNav active={activeTab} />

      {activeTab === "qr" ? (
        canScanSerials ? (
          <QrHistoryPanel canScan />
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-slate-600">
              You do not have permission to view serial numbers. Switch to{" "}
              <Link
                href="/inventory/product-movements"
                className="font-medium text-emerald-700 hover:underline"
              >
                Product In / Out
              </Link>{" "}
              or ask an admin for Warehouse / Purchase access.
            </CardContent>
          </Card>
        )
      ) : (
        <ProductMovementsPanel products={products} warehouses={warehouses} />
      )}
    </div>
  );
}
