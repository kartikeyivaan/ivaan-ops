"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SerializedInventoryLot } from "@/lib/inventory-service";

export function InwardForm({ lot }: { lot: SerializedInventoryLot }) {
  const router = useRouter();
  const pending =
    Number(lot.quantity) - Number(lot.receivedQuantity) - Number(lot.damagedQuantity);

  const [receivedQty, setReceivedQty] = useState("");
  const [damagedQty, setDamagedQty] = useState("0");
  const [serialInput, setSerialInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const serialNumbers = lot.product.serialTracking
      ? serialInput
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;

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
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to receive material.");
      return;
    }

    router.push("/inventory/incoming");
    router.refresh();
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
                <textarea
                  id="serials"
                  className="min-h-40 w-full rounded-md border border-slate-200 p-3 text-sm"
                  placeholder="Enter one serial per line for received units"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Serial count must match received quantity. Damaged units do not need serials.
                </p>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              {loading ? "Saving..." : "Confirm receipt"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
