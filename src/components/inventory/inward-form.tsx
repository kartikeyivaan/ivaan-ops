"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import { IncomingLotReceiveEditDialog } from "@/components/inventory/incoming-lot-receive-edit-dialog";
import {
  classifyInwardSerials,
  MAX_SERIALS_PER_ENTRY,
  normalizeSerialNumber,
  parseSerialInput,
  serialsPerEntryLimitMessage,
  type InwardSerialClassification,
} from "@/lib/inventory";
import type { SerializedIncomingLotChangeRequest } from "@/lib/incoming-lot-change-service";
import type { SerializedInventoryLot } from "@/lib/inventory-service";

type Product = { id: string; displayName: string; gstRate: number };

type SerialHighlightSets = {
  newKeys: Set<string>;
  repeatKeys: Set<string>;
  invalidKeys: Set<string>;
};

function SerialHighlightOverlay({
  value,
  highlights,
}: {
  value: string;
  highlights: SerialHighlightSets | null;
}) {
  if (!value) return null;

  const parts = value.split(/(\[QR\]|[,\n;\t]+)/gi);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (/^\[QR\]$/i.test(part)) {
          return (
            <span key={index} className="text-slate-300">
              {part}
            </span>
          );
        }
        if (/^[,\n;\t]+$/.test(part)) {
          return <span key={index}>{part}</span>;
        }
        const trimmed = part.trim();
        if (!trimmed) return <span key={index}>{part}</span>;

        const key = normalizeSerialNumber(trimmed);
        let className: string | undefined;
        if (highlights) {
          if (highlights.invalidKeys.has(key)) {
            className = "bg-amber-100 text-amber-900";
          } else if (highlights.repeatKeys.has(key)) {
            className = "bg-red-100 text-red-700";
          } else if (highlights.newKeys.has(key)) {
            className = "bg-emerald-100 text-emerald-800";
          }
        }
        return (
          <span key={index} className={className}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function SerialCategoryBlock({
  title,
  qty,
  serials,
  tone,
}: {
  title: string;
  qty: number;
  serials: string[];
  tone: "new" | "repeat" | "invalid";
}) {
  const styles =
    tone === "new"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "repeat"
        ? "border-red-200 bg-red-50 text-red-950"
        : "border-amber-200 bg-amber-50 text-amber-950";
  const listTone =
    tone === "new"
      ? "text-emerald-800"
      : tone === "repeat"
        ? "text-red-800"
        : "text-amber-900";

  return (
    <div className={`rounded-md border p-3 text-sm ${styles}`}>
      <p className="font-medium">
        {title} ({qty})
      </p>
      {qty > 0 ? (
        <p className={`mt-1 break-all ${listTone}`}>{serials.join(", ")}</p>
      ) : (
        <p className="mt-1 opacity-70">None</p>
      )}
    </div>
  );
}

export function InwardForm({
  lot: initialLot,
  products,
  canEditLot,
  requiresEditApproval,
  pendingChange: initialPendingChange,
}: {
  lot: SerializedInventoryLot;
  products: Product[];
  canEditLot: boolean;
  requiresEditApproval: boolean;
  pendingChange: SerializedIncomingLotChangeRequest | null;
}) {
  const router = useRouter();
  const [lot, setLot] = useState(initialLot);
  const [pendingChange, setPendingChange] = useState(initialPendingChange);
  const [editOpen, setEditOpen] = useState(false);
  const pending =
    Number(lot.quantity) - Number(lot.receivedQuantity) - Number(lot.damagedQuantity);
  const submittingRef = useRef(false);
  const serialOverlayRef = useRef<HTMLDivElement>(null);
  const lotStillEditable =
    lot.status === "INCOMING" &&
    Number(lot.receivedQuantity) === 0 &&
    Number(lot.damagedQuantity) === 0;
  const showEditLot = canEditLot && lotStillEditable && !pendingChange;

  const [receivedQty, setReceivedQty] = useState(() => (pending > 0 ? String(pending) : ""));
  const [damagedQty, setDamagedQty] = useState("0");
  const [serialInput, setSerialInput] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [classification, setClassification] = useState<InwardSerialClassification | null>(
    null,
  );
  const [checkingSerials, setCheckingSerials] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const serialInputRef = useRef(serialInput);
  serialInputRef.current = serialInput;

  /** Expected good units for this receipt. Damaged units do not need serials. */
  const expectedSerialQty = Math.max(0, Number(receivedQty) || 0);
  const damageOnlyReceipt =
    expectedSerialQty === 0 && (Number(damagedQty) || 0) > 0;

  useEffect(() => {
    setLot(initialLot);
  }, [initialLot]);

  useEffect(() => {
    setPendingChange(initialPendingChange);
  }, [initialPendingChange]);

  const parsedSerials = lot.product.serialTracking ? parseSerialInput(serialInput) : [];
  const brandName = lot.product.brand.name;
  const categoryName = lot.product.category.name;
  const highlightSets: SerialHighlightSets | null = classification
    ? {
        newKeys: new Set(classification.newSerials),
        repeatKeys: new Set(classification.repeatSerials),
        invalidKeys: new Set(classification.invalidSerials),
      }
    : null;

  const newSerialCount = classification?.newSerials.length ?? 0;
  const newMatchesExpected =
    Boolean(classification) &&
    newSerialCount > 0 &&
    newSerialCount === expectedSerialQty;
  const canConfirmSerialReceipt =
    !lot.product.serialTracking ||
    damageOnlyReceipt ||
    (newMatchesExpected && !checkingSerials);

  function handleSerialChange(nextValue: string) {
    setSerialInput(nextValue);
    setClassification(null);
  }

  const addSerialNumbers = useCallback(async () => {
    if (!lot.product.serialTracking || pendingChange) return;

    const serials = parseSerialInput(serialInputRef.current);
    if (serials.length === 0) {
      setError("Enter at least one serial number.");
      setClassification(null);
      setReceivedQty("");
      return;
    }

    setCheckingSerials(true);
    setError("");

    try {
      const uniqueForLookup = Array.from(
        new Set(serials.map(normalizeSerialNumber).filter(Boolean)),
      );
      if (uniqueForLookup.length === 0) {
        setError("Enter at least one valid serial number.");
        setClassification(null);
        setCheckingSerials(false);
        return;
      }
      if (uniqueForLookup.length > MAX_SERIALS_PER_ENTRY) {
        setError(serialsPerEntryLimitMessage(uniqueForLookup.length));
        setClassification(null);
        setCheckingSerials(false);
        return;
      }

      const response = await fetch("/api/inventory/serials/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumbers: uniqueForLookup }),
      });

      let data: { message?: string; existingSerialNumbers?: string[] } = {};
      try {
        data = await response.json();
      } catch {
        setError(
          response.ok
            ? "Failed to check serial numbers."
            : `Serial check failed (${response.status}). Refresh the page and try again.`,
        );
        setClassification(null);
        return;
      }

      if (!response.ok) {
        setError(data.message ?? `Failed to check serial numbers (${response.status}).`);
        setClassification(null);
        return;
      }

      const existingKeys = data.existingSerialNumbers ?? [];
      const next = classifyInwardSerials({
        serials,
        existingKeys,
        brandName,
        categoryName,
      });
      setClassification(next);

      if (next.newSerials.length === 0 && expectedSerialQty > 0) {
        setError("No new serial numbers found. Resolve repeats or invalid formats.");
      } else if (next.newSerials.length !== expectedSerialQty) {
        setError(
          `New serial qty (${next.newSerials.length}) must match expected qty (${expectedSerialQty}) to confirm receipt.`,
        );
      } else {
        setError("");
      }
    } catch {
      setError("Failed to check serial numbers. Check your connection and try again.");
      setClassification(null);
    } finally {
      setCheckingSerials(false);
    }
  }, [
    brandName,
    categoryName,
    expectedSerialQty,
    lot.product.serialTracking,
    pendingChange,
  ]);

  const handleScannedSerials = useCallback(async (scanned: string[]): Promise<SerialScanResult> => {
    const existingKeys = new Set(
      parseSerialInput(serialInputRef.current).map(normalizeSerialNumber),
    );
    const toAdd: string[] = [];
    const duplicates: string[] = [];

    for (const serial of scanned) {
      const key = normalizeSerialNumber(serial);
      if (!key) continue;
      if (existingKeys.has(key) || toAdd.some((item) => normalizeSerialNumber(item) === key)) {
        duplicates.push(serial);
        continue;
      }
      toAdd.push(serial);
      existingKeys.add(key);
    }

    if (toAdd.length === 0) {
      return {
        ok: false,
        reason:
          duplicates.length > 0
            ? `Already added: ${normalizeSerialNumber(duplicates[0])}`
            : "No serial number found in scan.",
      };
    }

    const base = serialInputRef.current.trim();
    const nextValue = [base, ...toAdd].filter(Boolean).join("\n");
    const withTrailingNewline = nextValue.endsWith("\n") ? nextValue : `${nextValue}\n`;
    setSerialInput(withTrailingNewline);
    serialInputRef.current = withTrailingNewline;
    setClassification(null);

    return {
      ok: true,
      message: toAdd.map(normalizeSerialNumber).join(", "),
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    if (pendingChange) {
      setError("Resolve the pending lot edit approval before confirming receipt.");
      return;
    }

    if (lot.product.serialTracking) {
      if (damageOnlyReceipt) {
        // Damaged-only: no serials required.
      } else if (!classification) {
        setError('Click "Add Serial Number" to validate serials before confirming.');
        return;
      } else if (classification.newSerials.length !== expectedSerialQty) {
        setError(
          `New serial qty (${classification.newSerials.length}) must match expected qty (${expectedSerialQty}) to confirm receipt.`,
        );
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);
    setError("");

    const serialNumbers =
      lot.product.serialTracking && !damageOnlyReceipt
        ? classification!.newSerials
        : undefined;
    const qtyToReceive = Number(receivedQty);

    try {
      const response = await fetch("/api/inventory/inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lot.id,
          receivedQty: qtyToReceive,
          damagedQty: Number(damagedQty),
          serialNumbers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Failed to receive material.");
        submittingRef.current = false;
        setLoading(false);
        return;
      }

      router.push("/inventory/incoming");
      router.refresh();
    } catch {
      setError("Failed to receive material.");
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="px-0">
        <Link href="/inventory/incoming">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to incoming list
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Receive material</h1>
          <p className="text-sm text-slate-500">
            {lot.lotNumber} · {lot.product.displayName} · {lot.warehouse.name}
          </p>
        </div>
        {showEditLot ? (
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit product / qty / invoice
          </Button>
        ) : null}
      </div>

      {pendingChange ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Pending Purchase approval</p>
          <p className="mt-1 text-amber-900">
            Proposed: {pendingChange.proposedProductName} · qty{" "}
            {pendingChange.proposedQuantity} · invoice {pendingChange.proposedPurchaseInvoiceNo}
          </p>
          <p className="mt-2 text-amber-800">
            Receipt is blocked until Purchase approves or rejects this change.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lot summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">Expected:</span> {Number(lot.quantity)}
          </p>
          <p>
            <span className="text-slate-500">Already received:</span> {Number(lot.receivedQuantity)}
          </p>
          <p>
            <span className="text-slate-500">Damaged:</span> {Number(lot.damagedQuantity)}
          </p>
          <p>
            <span className="text-slate-500">Pending:</span> {pending}
          </p>
          {lot.purchaseInvoiceNo ? (
            <p>
              <span className="text-slate-500">Invoice:</span> {lot.purchaseInvoiceNo}
            </p>
          ) : null}
          {lot.vendor ? (
            <p>
              <span className="text-slate-500">Vendor:</span> {lot.vendor.vendorName}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warehouse receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receivedQty">Expected / received quantity</Label>
                <Input
                  id="receivedQty"
                  type="number"
                  min="0"
                  step="any"
                  className="h-12 text-lg"
                  value={receivedQty}
                  onChange={(e) => {
                    setReceivedQty(e.target.value);
                    setClassification(null);
                  }}
                  required
                  disabled={Boolean(pendingChange)}
                />
                {lot.product.serialTracking ? (
                  <p className="text-xs text-slate-500">
                    New serial qty must match this expected qty to confirm. Pending on lot:{" "}
                    {pending}.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="damagedQty">Damaged quantity</Label>
                <Input
                  id="damagedQty"
                  type="number"
                  min="0"
                  step="any"
                  className="h-12 text-lg"
                  value={damagedQty}
                  onChange={(e) => setDamagedQty(e.target.value)}
                  disabled={Boolean(pendingChange)}
                />
              </div>
            </div>

            {lot.product.serialTracking ? (
              <div className="space-y-3">
                <Label htmlFor="serials">Serial numbers (one per line)</Label>
                <ScanSerialsButton
                  className="h-12 w-full border-emerald-300 bg-emerald-50 text-base text-emerald-900 hover:bg-emerald-100"
                  onClick={() => setScannerOpen(true)}
                  disabled={Boolean(pendingChange) || checkingSerials}
                />
                <div className="relative">
                  <div
                    ref={serialOverlayRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 min-h-40 overflow-hidden whitespace-pre-wrap break-all rounded-md border border-transparent p-3 font-mono text-sm leading-5 text-slate-800"
                  >
                    <SerialHighlightOverlay value={serialInput} highlights={highlightSets} />
                  </div>
                  <textarea
                    id="serials"
                    className="relative min-h-40 w-full resize-y rounded-md border border-slate-200 bg-transparent p-3 font-mono text-sm leading-5 text-transparent caret-slate-900 placeholder:text-slate-400 selection:bg-sky-200/60 disabled:opacity-60"
                    placeholder="Enter or paste serials, then click Add Serial Number"
                    value={serialInput}
                    onChange={(e) => handleSerialChange(e.target.value)}
                    onScroll={(e) => {
                      const overlay = serialOverlayRef.current;
                      if (!overlay) return;
                      overlay.scrollTop = e.currentTarget.scrollTop;
                      overlay.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                    spellCheck={false}
                    disabled={Boolean(pendingChange) || checkingSerials}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full text-base"
                  disabled={
                    Boolean(pendingChange) || checkingSerials || parsedSerials.length === 0
                  }
                  onClick={() => void addSerialNumbers()}
                >
                  {checkingSerials ? "Checking…" : "Add Serial Number"}
                </Button>
                <p className="text-xs text-slate-500">
                  Checks each serial against the system. Confirm receipt only when new serial qty
                  matches expected qty ({expectedSerialQty}). Damaged units do not need serials.
                </p>

                {classification ? (
                  <div className="space-y-2">
                    <SerialCategoryBlock
                      title="New Serial Number"
                      qty={classification.newSerials.length}
                      serials={classification.newSerials}
                      tone="new"
                    />
                    <SerialCategoryBlock
                      title="Repeat Serial Number"
                      qty={classification.repeatSerials.length}
                      serials={classification.repeatSerials}
                      tone="repeat"
                    />
                    <SerialCategoryBlock
                      title="Invalid Format"
                      qty={classification.invalidSerials.length}
                      serials={classification.invalidSerials}
                      tone="invalid"
                    />
                    {newMatchesExpected ? (
                      <p className="text-sm text-emerald-700">
                        New serial qty matches expected qty ({expectedSerialQty}). Ready to
                        confirm.
                      </p>
                    ) : (
                      <p className="text-sm text-red-600">
                        New serial qty ({newSerialCount}) must equal expected qty (
                        {expectedSerialQty}) before confirming.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button
              type="submit"
              className="h-12 w-full text-base"
              disabled={loading || Boolean(pendingChange) || !canConfirmSerialReceipt}
            >
              {loading ? "Saving..." : "Confirm receipt"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannedSerials}
        title="Scan inward serials"
      />

      {editOpen ? (
        <IncomingLotReceiveEditDialog
          lot={lot}
          products={products}
          requiresApproval={requiresEditApproval}
          onClose={() => setEditOpen(false)}
          onApplied={async (updatedLot) => {
            setLot(updatedLot);
            setPendingChange(null);
            router.refresh();
          }}
          onSubmittedForApproval={async (changeRequest) => {
            setPendingChange(changeRequest);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
