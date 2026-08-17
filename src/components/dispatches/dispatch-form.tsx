"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/dispatches/signature-pad";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import {
  MAX_SERIALS_PER_ENTRY,
  normalizeSerialNumber,
  parseSerialInput,
  serialsPerEntryLimitMessage,
} from "@/lib/inventory";
import { normalizeMobileNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  describePartialDispatchLines,
  effectiveDispatchQty,
  formatPartialDispatchConfirmMessage,
  isPartialDispatch,
} from "@/lib/dispatches";

type BookablePi = {
  id: string;
  piNo: string;
  customer: { customerName: string };
  warehouse: { name: string } | null;
  dispatchTodayMarkedBy?: { name: string } | null;
  crossCompanyTransfer?: {
    fromCompanyCode: string;
    fromCompanyName: string;
    lines: Array<{ displayName: string; qty: number }>;
  } | null;
  draft?: {
    vehicleNo: string | null;
    driverName: string | null;
    receiverName: string | null;
    receiverMobile: string | null;
    notes: string | null;
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    serialTracking: boolean;
    orderedQty: number;
    dispatchedQty: number;
    remainingQty: number;
  }>;
};

type SelectedSerial = { id: string; serialNumber: string };

type InvalidSerial = { serialNumber: string; reason: string };

type LineDraft = {
  proformaInvoiceItemId: string;
  productId: string;
  productName: string;
  serialTracking: boolean;
  remainingQty: number;
  qty: string;
  serials: SelectedSerial[];
  pasteText: string;
  invalidSerials: InvalidSerial[];
  lookingUp: boolean;
};

function parseSerialPaste(text: string): string[] {
  return parseSerialInput(text);
}

export function DispatchForm({ defaultPiId }: { defaultPiId?: string }) {
  const router = useRouter();
  const [bookablePis, setBookablePis] = useState<BookablePi[]>([]);
  const [piId, setPiId] = useState(defaultPiId ?? "");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerLineIndex, setScannerLineIndex] = useState<number | null>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const piIdRef = useRef(piId);
  piIdRef.current = piId;
  const linesForPiIdRef = useRef("");

  useEffect(() => {
    fetch("/api/dispatches/bookable-pis")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBookablePis(data);
          setPiId((current) => current || data[0]?.id || "");
        }
      });
  }, []);

  useEffect(() => {
    const pi = bookablePis.find((row) => row.id === piId);
    if (!pi) {
      if (linesForPiIdRef.current) {
        setLines([]);
        linesForPiIdRef.current = "";
      }
      return;
    }
    if (linesForPiIdRef.current === pi.id) return;

    linesForPiIdRef.current = pi.id;
    setVehicleNo(pi.draft?.vehicleNo ?? "");
    setDriverName(pi.draft?.driverName ?? "");
    setReceiverName(pi.draft?.receiverName ?? "");
    setReceiverMobile(pi.draft?.receiverMobile ?? "");
    setNotes(pi.draft?.notes ?? "");

    setLines(
      pi.items
        .filter((item) => item.remainingQty > 0)
        .map((item) => ({
          proformaInvoiceItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          serialTracking: item.serialTracking,
          remainingQty: item.remainingQty,
          qty: item.serialTracking ? "0" : String(item.remainingQty),
          serials: [],
          pasteText: "",
          invalidSerials: [],
          lookingUp: false,
        })),
    );
  }, [piId, bookablePis]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => {
      const next = current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      );
      linesRef.current = next;
      return next;
    });
  }

  function removeSerial(lineIndex: number, serialId: string) {
    setLines((current) => {
      const next = current.map((line, index) => {
        if (index !== lineIndex) return line;
        const serials = line.serials.filter((serial) => serial.id !== serialId);
        return {
          ...line,
          serials,
          qty: String(serials.length || line.qty),
        };
      });
      linesRef.current = next;
      return next;
    });
  }

  async function addSerialsFromPaste(lineIndex: number) {
    const line = lines[lineIndex];
    if (!line || !piId) return;

    const serialNumbers = parseSerialPaste(line.pasteText);
    if (serialNumbers.length === 0) {
      updateLine(lineIndex, {
        invalidSerials: [{ serialNumber: "", reason: "Paste or type at least one serial number." }],
      });
      return;
    }

    await lookupAndAddSerials(lineIndex, serialNumbers);
  }

  async function lookupAndAddSerials(
    lineIndex: number,
    serialNumbers: string[],
  ): Promise<SerialScanResult> {
    const line = linesRef.current[lineIndex];
    const currentPiId = piIdRef.current;
    if (!line || !currentPiId) {
      return { ok: false, reason: "Select a booked PI first." };
    }
    if (serialNumbers.length > MAX_SERIALS_PER_ENTRY) {
      const reason = serialsPerEntryLimitMessage(serialNumbers.length);
      updateLine(lineIndex, {
        lookingUp: false,
        invalidSerials: [{ serialNumber: "", reason }],
      });
      return { ok: false, reason };
    }

    updateLine(lineIndex, { lookingUp: true, invalidSerials: [] });

    try {
      const response = await fetch("/api/dispatches/lookup-serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piId: currentPiId,
          productId: line.productId,
          serialNumbers,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const reason = data.message ?? "Unable to look up serial numbers.";
        updateLine(lineIndex, {
          lookingUp: false,
          invalidSerials: [{ serialNumber: "", reason }],
        });
        return { ok: false, reason };
      }

      // Re-read latest line state after await
      const latest = linesRef.current[lineIndex] ?? line;
      const existingIds = new Set(latest.serials.map((serial) => serial.id));
      const existingNumbers = new Set(
        latest.serials.map((serial) => serial.serialNumber.toUpperCase()),
      );
      const added: SelectedSerial[] = [];
      const invalid: InvalidSerial[] = [...(data.invalid ?? [])];

      for (const found of data.valid ?? []) {
        if (existingIds.has(found.id) || existingNumbers.has(found.serialNumber.toUpperCase())) {
          invalid.push({
            serialNumber: found.serialNumber,
            reason: "Already added.",
          });
          continue;
        }
        added.push({ id: found.id, serialNumber: found.serialNumber });
        existingIds.add(found.id);
        existingNumbers.add(found.serialNumber.toUpperCase());
      }

      const serials = [...latest.serials, ...added];
      updateLine(lineIndex, {
        lookingUp: false,
        serials,
        qty: String(serials.length),
        pasteText: "",
        invalidSerials: invalid,
      });

      if (added.length === 0) {
        const first = invalid[0];
        return {
          ok: false,
          reason: first
            ? first.serialNumber
              ? `${normalizeSerialNumber(first.serialNumber)} — ${first.reason}`
              : first.reason
            : "No valid serial numbers found.",
        };
      }

      if (invalid.length > 0) {
        const first = invalid[0];
        return {
          ok: false,
          reason: first.serialNumber
            ? `${normalizeSerialNumber(first.serialNumber)} — ${first.reason}`
            : first.reason,
        };
      }

      return {
        ok: true,
        message: added.map((serial) => serial.serialNumber).join(", "),
      };
    } catch {
      updateLine(lineIndex, {
        lookingUp: false,
        invalidSerials: [{ serialNumber: "", reason: "Unable to look up serial numbers." }],
      });
      return { ok: false, reason: "Unable to look up serial numbers." };
    }
  }

  const handleScannedSerials = useCallback(
    async (serialNumbers: string[]): Promise<SerialScanResult> => {
      if (scannerLineIndex === null) {
        return { ok: false, reason: "No dispatch line selected for scanning." };
      }
      return lookupAndAddSerials(scannerLineIndex, serialNumbers);
    },
    // lookupAndAddSerials uses refs for latest line/pi state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scannerLineIndex],
  );

  async function handleSubmit() {
    setError("");

    const dispatchLines = lines.filter((line) => effectiveDispatchQty(line) > 0);
    if (dispatchLines.length === 0) {
      setError("Enter dispatch quantity for at least one line.");
      return;
    }

    if (isPartialDispatch(lines)) {
      const confirmed = window.confirm(
        formatPartialDispatchConfirmMessage(describePartialDispatchLines(lines)),
      );
      if (!confirmed) return;
    }

    setLoading(true);

    const payload = {
      proformaInvoiceId: piId,
      vehicleNo: vehicleNo || undefined,
      driverName: driverName || undefined,
      receiverName,
      receiverMobile,
      signatureUrl: signatureUrl || undefined,
      notes: notes || undefined,
      confirm: true,
      lines: dispatchLines.map((line) => ({
          proformaInvoiceItemId: line.proformaInvoiceItemId,
          productId: line.productId,
          qty: effectiveDispatchQty(line),
          serialIds: line.serialTracking ? line.serials.map((serial) => serial.id) : undefined,
        })),
    };

    try {
      const response = await fetch("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: { id?: string; message?: string } = {};
      try {
        data = (await response.json()) as { id?: string; message?: string };
      } catch {
        setError(
          response.ok
            ? "Dispatch may have been created, but the response was invalid. Refresh and check the dispatch list."
            : "Unable to create dispatch. The server timed out or returned an invalid response. Please retry.",
        );
        return;
      }

      if (!response.ok) {
        setError(data.message ?? "Unable to create dispatch.");
        return;
      }

      if (!data.id) {
        setError("Dispatch response was missing an id. Refresh and check the dispatch list.");
        return;
      }

      router.push(`/inventory/dispatches/${data.id}`);
    } catch {
      setError("Unable to create dispatch. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  const selectedPi = bookablePis.find((row) => row.id === piId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Dispatch</h1>
          <p className="text-sm text-slate-500">
            Only PIs marked Dispatch Today appear here. Sales-entered details are prefilled.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/inventory/dispatches">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatch Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Booked PI</Label>
            <select
              value={piId}
              onChange={(event) => setPiId(event.target.value)}
              className="flex h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-base"
            >
              {bookablePis.map((pi) => (
                <option key={pi.id} value={pi.id}>
                  {pi.piNo} · {pi.customer.customerName}
                  {pi.warehouse ? ` · ${pi.warehouse.name}` : ""}
                  {pi.dispatchTodayMarkedBy ? ` · marked by ${pi.dispatchTodayMarkedBy.name}` : ""}
                </option>
              ))}
            </select>
            {bookablePis.length === 0 ? (
              <p className="text-sm text-slate-500">
                No PIs are marked for dispatch today. Sales must mark a fully paid booked PI as
                Dispatch Today first.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Vehicle No *</Label>
            <Input
              required
              className="h-12 text-base"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Driver Name</Label>
            <Input
              className="h-12 text-base"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Receiver Name *</Label>
            <Input
              required
              className="h-12 text-base"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Receiver Mobile *</Label>
            <Input
              required
              type="tel"
              className="h-12 text-base"
              value={receiverMobile}
              onChange={(e) => setReceiverMobile(normalizeMobileNumber(e.target.value))}
              inputMode="numeric"
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Input className="h-12 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <SignaturePad onChange={setSignatureUrl} />
        </CardContent>
      </Card>

      {selectedPi?.crossCompanyTransfer ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Cross-company shortfall approved from{" "}
          <strong>{selectedPi.crossCompanyTransfer.fromCompanyCode}</strong> (
          {selectedPi.crossCompanyTransfer.fromCompanyName}). Scan/dispatch serials directly from
          that company; transfer is booked automatically when this DC is confirmed.
          <ul className="mt-2 list-disc pl-5">
            {selectedPi.crossCompanyTransfer.lines.map((line) => (
              <li key={line.displayName}>
                {line.displayName}: up to {line.qty}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedPi ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispatch Lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, index) => (
              <div key={line.proformaInvoiceItemId} className="rounded-md border p-4">
                <p className="font-medium">{line.productName}</p>
                <p className="text-sm text-slate-500">
                  Remaining booked qty: {line.remainingQty}
                  {line.productName.includes("(from ") ? (
                    <span className="block text-xs text-slate-500">
                      Kit component — dispatch full BOM together
                    </span>
                  ) : null}
                </p>
                <div className="mt-3 space-y-2">
                  <Label>Dispatch Qty</Label>
                  <Input
                    type="number"
                    min="0"
                    max={line.remainingQty}
                    step="any"
                    className="h-12 text-base"
                    value={line.serialTracking ? String(line.serials.length) : line.qty}
                    onChange={(event) => updateLine(index, { qty: event.target.value })}
                    disabled={line.serialTracking}
                  />
                  {line.serialTracking ? (
                    <p className="text-xs text-slate-500">
                      Qty follows accepted serials
                      {line.serials.length > 0 && line.serials.length < line.remainingQty
                        ? ` (${line.serials.length} of ${line.remainingQty}; remaining stay booked)`
                        : line.serials.length === 0
                          ? ` (scan to dispatch; ${line.remainingQty} remaining)`
                          : ""}
                      .
                    </p>
                  ) : null}
                </div>
                {line.serialTracking ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <Label>Serial numbers</Label>
                      <ScanSerialsButton
                        className="h-12 w-full border-emerald-300 bg-emerald-50 text-base text-emerald-900 hover:bg-emerald-100"
                        disabled={line.lookingUp || !piId}
                        onClick={() => setScannerLineIndex(index)}
                      />
                      <p className="text-xs text-slate-500">
                        Scan, paste, or type serials (newline, comma, or semicolon separated). Product
                        must match this line; company ownership is ignored.
                      </p>
                      <textarea
                        className={cn(
                          "flex min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                        )}
                        placeholder={"SN-001\nSN-002\nSN-003"}
                        value={line.pasteText}
                        onChange={(event) =>
                          updateLine(index, { pasteText: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            void addSerialsFromPaste(index);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        disabled={line.lookingUp || !line.pasteText.trim()}
                        onClick={() => void addSerialsFromPaste(index)}
                      >
                        {line.lookingUp ? "Checking…" : "Add Serials"}
                      </Button>
                    </div>

                    {line.serials.length > 0 ? (
                      <div className="space-y-2">
                        <Label>Accepted ({line.serials.length})</Label>
                        <div className="flex flex-wrap gap-2">
                          {line.serials.map((serial) => (
                            <span
                              key={serial.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm text-emerald-900"
                            >
                              {serial.serialNumber}
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-emerald-100"
                                aria-label={`Remove ${serial.serialNumber}`}
                                onClick={() => removeSerial(index, serial.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {line.invalidSerials.length > 0 ? (
                      <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                        <Label className="text-red-800">Wrong / rejected serials</Label>
                        <ul className="space-y-1 text-sm text-red-700">
                          {line.invalidSerials.map((item, invalidIndex) => (
                            <li key={`${item.serialNumber}-${invalidIndex}`}>
                              {item.serialNumber ? (
                                <span className="font-medium">{item.serialNumber}</span>
                              ) : null}
                              {item.serialNumber ? " — " : null}
                              {item.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Button
        className="h-12 w-full text-base"
        disabled={
          loading ||
          !piId ||
          !vehicleNo.trim() ||
          !receiverName.trim() ||
          receiverMobile.trim().length < 10
        }
        onClick={() => void handleSubmit()}
      >
        {loading ? "Dispatching..." : "Confirm Dispatch & Generate DC"}
      </Button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <SerialScanner
        open={scannerLineIndex !== null}
        onClose={() => setScannerLineIndex(null)}
        onScan={handleScannedSerials}
        title={
          scannerLineIndex !== null
            ? `Scan serials · ${lines[scannerLineIndex]?.productName ?? "line"}`
            : "Scan serials"
        }
      />
    </div>
  );
}
