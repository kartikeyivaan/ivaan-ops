"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import {
  findDuplicateSerialKeys,
  isWaareeBrand,
  isWaareePanelSerial,
  normalizeSerialNumber,
  parseSerialInput,
} from "@/lib/inventory";
import type { SerializedInventoryLot } from "@/lib/inventory-service";

function SerialHighlightOverlay({
  value,
  duplicateKeys,
}: {
  value: string;
  duplicateKeys: Set<string>;
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

        const isDuplicate = duplicateKeys.has(normalizeSerialNumber(trimmed));
        return (
          <span key={index} className={isDuplicate ? "bg-red-100 text-red-700" : undefined}>
            {part}
          </span>
        );
      })}
    </>
  );
}

export function InwardForm({ lot }: { lot: SerializedInventoryLot }) {
  const router = useRouter();
  const pending =
    Number(lot.quantity) - Number(lot.receivedQuantity) - Number(lot.damagedQuantity);
  const submittingRef = useRef(false);
  const serialOverlayRef = useRef<HTMLDivElement>(null);
  const validateWaareeFormat =
    lot.product.serialTracking && isWaareeBrand(lot.product.brand.name);

  const [receivedQty, setReceivedQty] = useState("");
  const [damagedQty, setDamagedQty] = useState("0");
  const [serialInput, setSerialInput] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const serialInputRef = useRef(serialInput);
  serialInputRef.current = serialInput;

  const parsedSerials = lot.product.serialTracking ? parseSerialInput(serialInput) : [];
  const uniqueSerials = Array.from(
    new Map(parsedSerials.map((serial) => [normalizeSerialNumber(serial), serial])).values(),
  );
  const duplicateKeys = findDuplicateSerialKeys(parsedSerials);
  const invalidWaareeSerials = validateWaareeFormat
    ? uniqueSerials.filter((serial) => !isWaareePanelSerial(serial))
    : [];

  function handleSerialChange(nextValue: string) {
    setSerialInput(nextValue);
    if (!lot.product.serialTracking) return;

    const serials = parseSerialInput(nextValue);
    const uniqueCount = new Set(serials.map(normalizeSerialNumber)).size;
    setReceivedQty(uniqueCount > 0 ? String(uniqueCount) : "");
  }

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

    const serials = parseSerialInput(withTrailingNewline);
    const uniqueCount = new Set(serials.map(normalizeSerialNumber)).size;
    setReceivedQty(uniqueCount > 0 ? String(uniqueCount) : "");

    return {
      ok: true,
      message: toAdd.map(normalizeSerialNumber).join(", "),
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");

    if (lot.product.serialTracking && duplicateKeys.size > 0) {
      setError("Remove duplicate serial numbers highlighted in red before confirming.");
      submittingRef.current = false;
      setLoading(false);
      return;
    }

    const serialNumbers = lot.product.serialTracking
      ? uniqueSerials.map(normalizeSerialNumber)
      : undefined;

    try {
      const response = await fetch("/api/inventory/inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lot.id,
          receivedQty: Number(receivedQty),
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

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receive material</h1>
        <p className="text-sm text-slate-500">
          {lot.lotNumber} · {lot.product.displayName} · {lot.warehouse.name}
        </p>
      </div>

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
                <Label htmlFor="receivedQty">Received quantity</Label>
                <Input
                  id="receivedQty"
                  type="number"
                  min="0"
                  step="any"
                  className="h-12 text-lg"
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(e.target.value)}
                  required
                />
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
                />
              </div>
            </div>

            {lot.product.serialTracking ? (
              <div className="space-y-2">
                <Label htmlFor="serials">Serial numbers (one per line)</Label>
                <ScanSerialsButton
                  className="h-12 w-full border-emerald-300 bg-emerald-50 text-base text-emerald-900 hover:bg-emerald-100"
                  onClick={() => setScannerOpen(true)}
                />
                <div className="relative">
                  <div
                    ref={serialOverlayRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 min-h-40 overflow-hidden whitespace-pre-wrap break-all rounded-md border border-transparent p-3 font-mono text-sm leading-5 text-slate-800"
                  >
                    <SerialHighlightOverlay
                      value={serialInput}
                      duplicateKeys={duplicateKeys}
                    />
                  </div>
                  <textarea
                    id="serials"
                    className="relative min-h-40 w-full resize-y rounded-md border border-slate-200 bg-transparent p-3 font-mono text-sm leading-5 text-transparent caret-slate-900 placeholder:text-slate-400 selection:bg-sky-200/60"
                    placeholder="Enter one serial per line for received units"
                    value={serialInput}
                    onChange={(e) => handleSerialChange(e.target.value)}
                    onScroll={(e) => {
                      const overlay = serialOverlayRef.current;
                      if (!overlay) return;
                      overlay.scrollTop = e.currentTarget.scrollTop;
                      overlay.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    Parsed: {parsedSerials.length}
                    {duplicateKeys.size > 0
                      ? ` · Unique: ${uniqueSerials.length}`
                      : ""}
                  </span>
                  <span>
                    Serial count must match received quantity. Damaged units do not need serials.
                  </span>
                </div>
                {duplicateKeys.size > 0 ? (
                  <p className="text-sm text-red-600">
                    Duplicate serials are highlighted in red. Remove repeats before confirming.
                  </p>
                ) : null}
                {invalidWaareeSerials.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">
                      Warning: {invalidWaareeSerials.length} serial
                      {invalidWaareeSerials.length === 1 ? "" : "s"} do not match the Waaree panel
                      format (e.g. WS07269074147109).
                    </p>
                    <ul className="mt-2 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-5 text-amber-800">
                      {invalidWaareeSerials.slice(0, 20).map((serial) => (
                        <li key={serial}>{serial}</li>
                      ))}
                      {invalidWaareeSerials.length > 20 ? (
                        <li>…and {invalidWaareeSerials.length - 20} more</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
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
    </div>
  );
}
