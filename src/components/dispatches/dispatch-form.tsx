"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BookablePi = {
  id: string;
  piNo: string;
  customer: { customerName: string };
  warehouse: { name: string } | null;
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

type SerialOption = { id: string; serialNumber: string };

type LineDraft = {
  proformaInvoiceItemId: string;
  productId: string;
  productName: string;
  serialTracking: boolean;
  remainingQty: number;
  qty: string;
  serialIds: string[];
};

export function DispatchForm({ defaultPiId }: { defaultPiId?: string }) {
  const router = useRouter();
  const [bookablePis, setBookablePis] = useState<BookablePi[]>([]);
  const [piId, setPiId] = useState(defaultPiId ?? "");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [serialOptions, setSerialOptions] = useState<Record<string, SerialOption[]>>({});
  const [scanInputs, setScanInputs] = useState<Record<string, string>>({});
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/dispatches/bookable-pis")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBookablePis(data);
          if (!piId && data[0]?.id) setPiId(data[0].id);
        }
      });
  }, [piId]);

  useEffect(() => {
    const pi = bookablePis.find((row) => row.id === piId);
    if (!pi) {
      setLines([]);
      return;
    }

    const nextLines = pi.items
      .filter((item) => item.remainingQty > 0)
      .map((item) => ({
        proformaInvoiceItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        serialTracking: item.serialTracking,
        remainingQty: item.remainingQty,
        qty: String(item.remainingQty),
        serialIds: [] as string[],
      }));
    setLines(nextLines);

    for (const item of pi.items.filter((row) => row.serialTracking && row.remainingQty > 0)) {
      const params = new URLSearchParams({ piId: pi.id, productId: item.productId });
      fetch(`/api/dispatches/serials?${params.toString()}`)
        .then((response) => response.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSerialOptions((current) => ({ ...current, [item.id]: data }));
          }
        });
    }
  }, [piId, bookablePis]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function toggleSerial(lineIndex: number, serialId: string) {
    setLines((current) =>
      current.map((line, index) => {
        if (index !== lineIndex) return line;
        const exists = line.serialIds.includes(serialId);
        const serialIds = exists
          ? line.serialIds.filter((id) => id !== serialId)
          : [...line.serialIds, serialId];
        return {
          ...line,
          serialIds,
          qty: String(serialIds.length || line.qty),
        };
      }),
    );
  }

  async function scanSerial(lineIndex: number, line: LineDraft) {
    const serialNumber = scanInputs[line.proformaInvoiceItemId]?.trim();
    if (!serialNumber || !piId) return;

    setScanErrors((current) => ({ ...current, [line.proformaInvoiceItemId]: "" }));
    const params = new URLSearchParams({ piId, serialNumber });
    const response = await fetch(`/api/dispatches/lookup-serial?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      setScanErrors((current) => ({
        ...current,
        [line.proformaInvoiceItemId]: data.message ?? "Serial not found.",
      }));
      return;
    }

    if (data.product.id !== line.productId) {
      setScanErrors((current) => ({
        ...current,
        [line.proformaInvoiceItemId]: "Serial belongs to a different product line.",
      }));
      return;
    }

    if (!line.serialIds.includes(data.id)) {
      toggleSerial(lineIndex, data.id);
    }

    setScanInputs((current) => ({ ...current, [line.proformaInvoiceItemId]: "" }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    const payload = {
      proformaInvoiceId: piId,
      vehicleNo: vehicleNo || undefined,
      driverName: driverName || undefined,
      receiverName,
      receiverMobile,
      notes: notes || undefined,
      confirm: true,
      lines: lines
        .filter((line) => Number(line.qty) > 0)
        .map((line) => ({
          proformaInvoiceItemId: line.proformaInvoiceItemId,
          productId: line.productId,
          qty: Number(line.qty),
          serialIds: line.serialTracking ? line.serialIds : undefined,
        })),
    };

    const response = await fetch("/api/dispatches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to create dispatch.");
      return;
    }

    router.push(`/inventory/dispatches/${data.id}`);
  }

  const selectedPi = bookablePis.find((row) => row.id === piId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Dispatch</h1>
          <p className="text-sm text-slate-500">Dispatch from booked PI stock only.</p>
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
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Vehicle No *</Label>
            <Input required className="h-12 text-base" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Driver Name</Label>
            <Input className="h-12 text-base" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Receiver Name *</Label>
            <Input required className="h-12 text-base" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Receiver Mobile *</Label>
            <Input required type="tel" className="h-12 text-base" value={receiverMobile} onChange={(e) => setReceiverMobile(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Input className="h-12 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

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
                </p>
                <div className="mt-3 space-y-2">
                  <Label>Dispatch Qty</Label>
                  <Input
                    type="number"
                    min="0"
                    max={line.remainingQty}
                    step="any"
                    className="h-12 text-base"
                    value={line.qty}
                    onChange={(event) => updateLine(index, { qty: event.target.value })}
                    disabled={line.serialTracking}
                  />
                </div>
                {line.serialTracking ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <Label>Scan Serial</Label>
                      <div className="flex gap-2">
                        <Input
                          className="h-12 text-base"
                          placeholder="Scan or enter serial number"
                          value={scanInputs[line.proformaInvoiceItemId] ?? ""}
                          onChange={(event) =>
                            setScanInputs((current) => ({
                              ...current,
                              [line.proformaInvoiceItemId]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void scanSerial(index, line);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12"
                          onClick={() => void scanSerial(index, line)}
                        >
                          Add
                        </Button>
                      </div>
                      {scanErrors[line.proformaInvoiceItemId] ? (
                        <p className="text-sm text-red-600">{scanErrors[line.proformaInvoiceItemId]}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Selected Serials ({line.serialIds.length})</Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(serialOptions[line.proformaInvoiceItemId] ?? []).map((serial) => (
                          <label
                            key={serial.id}
                            className="flex h-12 items-center gap-2 rounded-md border px-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={line.serialIds.includes(serial.id)}
                              onChange={() => toggleSerial(index, serial.id)}
                            />
                            {serial.serialNumber}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Button className="h-12 w-full text-base" disabled={loading || !piId || !vehicleNo.trim() || !receiverName.trim() || receiverMobile.trim().length < 10} onClick={handleSubmit}>
        {loading ? "Dispatching..." : "Confirm Dispatch & Generate DC"}
      </Button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
