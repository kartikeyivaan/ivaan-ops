"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, PackagePlus } from "lucide-react";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
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
import {
  findDuplicateSerialKeys,
  normalizeSerialNumber,
  parseSerialInput,
} from "@/lib/inventory";
import {
  MANUAL_STOCK_ACTION_LABELS,
  MANUAL_STOCK_CONDITION_LABELS,
  MANUAL_STOCK_REASON_LABELS,
  MANUAL_STOCK_REASONS,
} from "@/lib/manual-stock-constants";
import type { ManualStockReason } from "@prisma/client";

type ProductOption = {
  id: string;
  displayName: string;
  serialTracking: boolean;
};

type WarehouseOption = { id: string; name: string };

type EntryLine = {
  id: string;
  serialId: string | null;
  serialNumber: string | null;
  fromStatus: string | null;
  toStatus: string | null;
};

export type ManualStockEntryRow = {
  id: string;
  entryNumber: string;
  action: "IN" | "OUT" | "CHANGE_CONDITION";
  reason: ManualStockReason;
  notes: string | null;
  condition: "GOOD" | "DAMAGED" | null;
  quantity: number;
  createdAt: string;
  product: { id: string; displayName: string; serialTracking: boolean };
  warehouse: { id: string; name: string };
  createdBy: { id: string; name: string; email: string };
  lines: EntryLine[];
};

type FormMode = "SERIAL_IN" | "SERIAL_OUT" | "CHANGE_CONDITION" | "QTY";

type SuccessSummary = {
  entryNumber: string;
  actionLabel: string;
  productName: string;
  warehouseName: string;
  quantity: number;
  serialNumbers: string[];
  condition?: string | null;
  reason: string;
};

export function ManualStockEntryWorkbench({
  products,
  warehouses,
  initialEntries,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  initialEntries: ManualStockEntryRow[];
}) {
  const [mode, setMode] = useState<FormMode>("SERIAL_IN");
  const [qtyDirection, setQtyDirection] = useState<"IN" | "OUT">("IN");
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [condition, setCondition] = useState<"GOOD" | "DAMAGED">("GOOD");
  const [reason, setReason] = useState<ManualStockReason>("CORRECTION");
  const [notes, setNotes] = useState("");
  const [serialInput, setSerialInput] = useState("");
  const [qty, setQty] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [success, setSuccess] = useState<SuccessSummary | null>(null);
  const submittingRef = useRef(false);
  const serialInputRef = useRef(serialInput);
  serialInputRef.current = serialInput;

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const serialProducts = useMemo(
    () => products.filter((p) => p.serialTracking),
    [products],
  );
  const qtyProducts = useMemo(
    () => products.filter((p) => !p.serialTracking),
    [products],
  );

  const productOptions = (mode === "QTY" ? qtyProducts : serialProducts).map(
    (p) => ({ value: p.id, label: p.displayName }),
  );
  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const duplicateKeys = findDuplicateSerialKeys(parseSerialInput(serialInput));

  function resetFormFields() {
    setSerialInput("");
    setQty("");
    setNotes("");
    setCondition("GOOD");
    setReason("CORRECTION");
    setError("");
  }

  function onModeChange(next: FormMode) {
    setMode(next);
    setProductId("");
    resetFormFields();
    setSuccess(null);
  }

  const handleScannedSerials = useCallback(async (serials: string[]): Promise<SerialScanResult> => {
    const incoming = serials.map(normalizeSerialNumber).filter(Boolean);
    if (incoming.length === 0) {
      return { ok: false, reason: "No serial detected." };
    }

    const existing = new Set(
      parseSerialInput(serialInputRef.current).map(normalizeSerialNumber),
    );
    const added: string[] = [];
    for (const serial of incoming) {
      if (existing.has(serial)) continue;
      existing.add(serial);
      added.push(serial);
    }

    if (added.length === 0) {
      return { ok: false, reason: "Serial already in the list." };
    }

    setSerialInput((prev) => {
      const base = prev.trim();
      return base ? `${base}\n${added.join("\n")}` : added.join("\n");
    });

    return { ok: true, message: `Added ${added.length} serial(s).` };
  }, []);

  async function submit() {
    if (submittingRef.current) return;
    setError("");
    setSuccess(null);

    if (!productId || !warehouseId) {
      setError("Select product and warehouse.");
      return;
    }
    if (reason === "OTHER" && !notes.trim()) {
      setError("Notes are required when reason is Other.");
      return;
    }

    let body: Record<string, unknown>;

    if (mode === "QTY") {
      const quantity = Number(qty);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError("Enter a quantity greater than zero.");
        return;
      }
      body = {
        mode: "QTY",
        action: qtyDirection,
        productId,
        warehouseId,
        qty: quantity,
        reason,
        notes: notes.trim() || null,
      };
    } else {
      const serialNumbers = parseSerialInput(serialInput).map(normalizeSerialNumber);
      if (serialNumbers.length === 0) {
        setError("Enter at least one serial number.");
        return;
      }
      if (duplicateKeys.size > 0) {
        setError("Remove duplicate serial numbers before submitting.");
        return;
      }

      if (mode === "SERIAL_IN") {
        body = {
          action: "IN",
          productId,
          warehouseId,
          serialNumbers,
          condition,
          reason,
          notes: notes.trim() || null,
        };
      } else if (mode === "SERIAL_OUT") {
        body = {
          action: "OUT",
          productId,
          warehouseId,
          serialNumbers,
          reason,
          notes: notes.trim() || null,
        };
      } else {
        body = {
          action: "CHANGE_CONDITION",
          productId,
          warehouseId,
          serialNumbers,
          condition,
          reason,
          notes: notes.trim() || null,
        };
      }
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/inventory/manual-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "Failed to save manual stock entry.");
        return;
      }

      const row = data as ManualStockEntryRow;
      setEntries((prev) => [row, ...prev]);
      setSuccess({
        entryNumber: row.entryNumber,
        actionLabel: MANUAL_STOCK_ACTION_LABELS[row.action],
        productName: row.product.displayName,
        warehouseName: row.warehouse.name,
        quantity: row.quantity,
        serialNumbers: row.lines
          .map((line) => line.serialNumber)
          .filter((value): value is string => Boolean(value)),
        condition: row.condition
          ? MANUAL_STOCK_CONDITION_LABELS[row.condition]
          : null,
        reason: MANUAL_STOCK_REASON_LABELS[row.reason],
      });
      resetFormFields();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  const modes: Array<{ id: FormMode; label: string }> = [
    { id: "SERIAL_IN", label: "Serial In" },
    { id: "SERIAL_OUT", label: "Serial Out" },
    { id: "CHANGE_CONDITION", label: "Change condition" },
    { id: "QTY", label: "Qty In / Out" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Inventory
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Manual Stock Entry</h1>
          <p className="text-sm text-slate-500">
            Super Admin direct inventory in, out, and condition changes — without purchase or sales
            documents.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {modes.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={mode === item.id ? "default" : "outline"}
            size="sm"
            onClick={() => onModeChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              Saved {success.entryNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-emerald-900">
            <p>
              <span className="font-medium">{success.actionLabel}</span> · {success.productName} ·{" "}
              {success.warehouseName}
            </p>
            <p>
              Qty {success.quantity}
              {success.condition ? ` · ${success.condition}` : ""} · {success.reason}
            </p>
            {success.serialNumbers.length > 0 ? (
              <p className="break-all font-mono text-xs">
                {success.serialNumbers.join(", ")}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setSuccess(null)}
            >
              Add another
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-4 w-4" />
            {modes.find((m) => m.id === mode)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TypeaheadSelect
              label="Product"
              options={productOptions}
              value={productId}
              onChange={setProductId}
              required
              placeholder="Search product..."
            />
            <TypeaheadSelect
              label="Warehouse"
              options={warehouseOptions}
              value={warehouseId}
              onChange={setWarehouseId}
              required
              placeholder="Search warehouse..."
            />
          </div>

          {selectedProduct ? (
            <p className="text-xs text-slate-500">
              {selectedProduct.serialTracking
                ? "Serial-tracked product"
                : "Non-serial product (quantity only)"}
            </p>
          ) : null}

          {mode === "QTY" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Direction</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={qtyDirection === "IN" ? "default" : "outline"}
                    onClick={() => setQtyDirection("IN")}
                  >
                    In
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={qtyDirection === "OUT" ? "default" : "outline"}
                    onClick={() => setQtyDirection("OUT")}
                  >
                    Out
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mse-qty">Quantity</Label>
                <Input
                  id="mse-qty"
                  type="number"
                  min={0}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {mode === "SERIAL_IN" || mode === "CHANGE_CONDITION" ? (
            <div className="space-y-2">
              <Label>Condition</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={condition === "GOOD" ? "default" : "outline"}
                  onClick={() => setCondition("GOOD")}
                >
                  Good
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={condition === "DAMAGED" ? "default" : "outline"}
                  onClick={() => setCondition("DAMAGED")}
                >
                  Damaged
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Good → Available · Damaged → Damaged stock
              </p>
            </div>
          ) : null}

          {mode !== "QTY" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="mse-serials">Serial numbers (one per line)</Label>
                <ScanSerialsButton onClick={() => setScannerOpen(true)} />
              </div>
              <textarea
                id="mse-serials"
                className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder={"SN001\nSN002"}
              />
              {duplicateKeys.size > 0 ? (
                <p className="text-xs text-red-600">
                  Duplicate serials in list: {Array.from(duplicateKeys).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mse-reason">Reason</Label>
              <select
                id="mse-reason"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value as ManualStockReason)}
              >
                {MANUAL_STOCK_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {MANUAL_STOCK_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mse-notes">
                Notes{reason === "OTHER" ? " (required)" : " (optional)"}
              </Label>
              <Input
                id="mse-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={reason === "OTHER" ? "Describe the reason" : "Optional details"}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="button" onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Confirm entry"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Recent entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">No manual stock entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Qty / Serials</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.entryNumber}</TableCell>
                      <TableCell>
                        <Badge>{MANUAL_STOCK_ACTION_LABELS[entry.action]}</Badge>
                        {entry.condition ? (
                          <span className="ml-2 text-xs text-slate-500">
                            {MANUAL_STOCK_CONDITION_LABELS[entry.condition]}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{entry.product.displayName}</TableCell>
                      <TableCell>{entry.warehouse.name}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm">{entry.quantity}</div>
                        {entry.lines.length > 0 ? (
                          <div className="truncate font-mono text-xs text-slate-500">
                            {entry.lines
                              .map((line) => line.serialNumber)
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {MANUAL_STOCK_REASON_LABELS[entry.reason]}
                        </div>
                        {entry.notes ? (
                          <div className="text-xs text-slate-500">{entry.notes}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{entry.createdBy.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannedSerials}
      />
    </div>
  );
}
