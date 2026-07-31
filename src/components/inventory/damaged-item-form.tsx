"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Send } from "lucide-react";
import {
  DAMAGE_CATEGORIES,
  DAMAGE_CATEGORY_LABELS,
} from "@/lib/damage-report-constants";
import { normalizeSerialNumber, parseSerialInput } from "@/lib/inventory";
import type { DamageCategory } from "@prisma/client";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LookupResult = {
  serialId: string;
  serialNumber: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  lotId: string;
  lotNumber: string;
  status: string;
};

export function DamagedItemForm() {
  const router = useRouter();

  const [serialNumber, setSerialNumber] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [category, setCategory] = useState<DamageCategory>("HANDLING");
  const [reason, setReason] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupSerial = useCallback(async (value?: string): Promise<boolean> => {
    const raw = value ?? serialNumber;
    const normalized = normalizeSerialNumber(raw);
    if (!normalized) {
      setError("Scan or enter a serial number.");
      return false;
    }

    setLookupLoading(true);
    setError(null);
    setLookup(null);
    setSerialNumber(normalized);

    try {
      const params = new URLSearchParams({ serialNumber: normalized });
      const response = await fetch(
        `/api/inventory/damage-reports/lookup?${params.toString()}`,
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message ?? "Unable to look up serial.");
        return false;
      }

      setLookup(data);
      return true;
    } catch {
      setError("Unable to look up serial.");
      return false;
    } finally {
      setLookupLoading(false);
    }
  }, [serialNumber]);

  const handleScannedSerials = useCallback(
    async (scanned: string[]): Promise<SerialScanResult> => {
      const serials = scanned.flatMap((entry) => parseSerialInput(entry));
      const first = serials.map(normalizeSerialNumber).find(Boolean);
      if (!first) {
        return { ok: false, reason: "No serial found in scan." };
      }

      setSerialNumber(first);
      const ok = await lookupSerial(first);
      if (!ok) {
        return { ok: false, reason: "Serial lookup failed." };
      }

      setScannerOpen(false);
      return { ok: true, message: first };
    },
    [lookupSerial],
  );

  async function submitReport() {
    if (!lookup) {
      setError("Look up a serial first.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    setSubmitLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/damage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumber: lookup.serialNumber,
          category,
          reason: reason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message ?? "Unable to submit damage report.");
        return;
      }

      router.push(`/inventory/damaged?highlight=${data.id}`);
      router.refresh();
    } catch {
      setError("Unable to submit damage report.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
          <Link href="/inventory/damaged">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to damaged items
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Report damaged panel</h1>
        <p className="text-sm text-slate-500">
          Scan one module serial, confirm details, and send for Super Admin approval.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Scan serial number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanSerialsButton
            className="h-12 w-full border-emerald-300 bg-emerald-50 text-base text-emerald-900 hover:bg-emerald-100"
            disabled={lookupLoading}
            onClick={() => setScannerOpen(true)}
          />
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Or type serial number</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="serialNumber"
                value={serialNumber}
                autoFocus
                placeholder="Type panel serial if not scanning"
                className="font-mono"
                onChange={(event) => {
                  setSerialNumber(event.target.value);
                  setLookup(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void lookupSerial();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={lookupLoading || !serialNumber.trim()}
                onClick={() => void lookupSerial()}
              >
                <Search className="mr-2 h-4 w-4" />
                {lookupLoading ? "Looking up…" : "Look up"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {lookup ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Panel details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Serial</div>
                <div className="font-mono font-medium">{lookup.serialNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Product</div>
                <div className="font-medium">{lookup.productName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Warehouse</div>
                <div>{lookup.warehouseName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Lot</div>
                <div>{lookup.lotNumber}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Damage details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Damage category *</Label>
                <select
                  id="category"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as DamageCategory)}
                >
                  {DAMAGE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {DAMAGE_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <textarea
                  id="reason"
                  className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Describe how / when the panel was damaged"
                  rows={4}
                />
              </div>
              <Button
                disabled={submitLoading || !reason.trim()}
                onClick={() => void submitReport()}
              >
                <Send className="mr-2 h-4 w-4" />
                {submitLoading ? "Sending…" : "Send for approval"}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan panel serial"
        onScan={handleScannedSerials}
      />
    </div>
  );
}
