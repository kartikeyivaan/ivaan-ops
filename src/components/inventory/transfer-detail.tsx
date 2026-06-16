"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TransferRecord } from "@/lib/transfer-service";

export function TransferDetail({
  transfer,
  activeCompanyId,
  canDispatch,
  canReceive,
  canCancel,
  canViewSerials,
  fromWarehouseName,
  toWarehouseName,
}: {
  transfer: TransferRecord;
  activeCompanyId: string;
  canDispatch: boolean;
  canReceive: boolean;
  canCancel: boolean;
  canViewSerials: boolean;
  fromWarehouseName: string;
  toWarehouseName: string;
}) {
  const router = useRouter();
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isOutgoing = transfer.fromCompanyId === activeCompanyId;
  const isIncoming = transfer.toCompanyId === activeCompanyId;
  const canDispatchNow = canDispatch && isOutgoing && transfer.status === "DRAFT";
  const canReceiveNow =
    canReceive &&
    isIncoming &&
    (transfer.status === "DISPATCHED" || transfer.status === "PARTIALLY_RECEIVED");
  const canCancelNow = canCancel && isOutgoing && transfer.status === "DRAFT";

  async function dispatchTransfer() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/inventory/transfers/${transfer.id}/dispatch`, {
      method: "POST",
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Failed to dispatch transfer.");
      return;
    }
    router.refresh();
  }

  async function cancelTransfer() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/inventory/transfers/${transfer.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Failed to cancel transfer.");
      return;
    }
    router.push("/inventory/transfers");
    router.refresh();
  }

  async function receiveTransfer(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const lines = transfer.lines
      .map((line) => ({
        lineId: line.id,
        receivedQty: Number(receiveQty[line.id] ?? 0),
      }))
      .filter((line) => line.receivedQty > 0);

    const response = await fetch(`/api/inventory/transfers/${transfer.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to receive transfer.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="px-0">
        <Link href="/inventory/transfers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to transfers
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{transfer.transferNumber}</h1>
          <p className="text-sm text-slate-500">
            {transfer.fromCompany.code} ({fromWarehouseName}) → {transfer.toCompany.code} (
            {toWarehouseName})
          </p>
        </div>
        <Badge>{transfer.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Received</TableHead>
                {canViewSerials ? <TableHead>Serials</TableHead> : null}
                {canReceiveNow ? <TableHead>Receive now</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines.map((line) => {
                const pending = Number(line.qty) - Number(line.receivedQty);
                return (
                  <TableRow key={line.id}>
                    <TableCell>{line.product.displayName}</TableCell>
                    <TableCell>{Number(line.qty)}</TableCell>
                    <TableCell>{Number(line.receivedQty)}</TableCell>
                    {canViewSerials ? (
                      <TableCell className="max-w-xs truncate text-xs text-slate-500">
                        {line.serials.map((row) => row.serial.serialNumber).join(", ") || "—"}
                      </TableCell>
                    ) : null}
                    {canReceiveNow ? (
                      <TableCell>
                        {line.product.serialTracking ? (
                          <span className="text-sm text-slate-500">{pending} pending</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            max={pending}
                            step="any"
                            className="h-12 w-28 text-lg"
                            value={receiveQty[line.id] ?? ""}
                            onChange={(e) =>
                              setReceiveQty((current) => ({
                                ...current,
                                [line.id]: e.target.value,
                              }))
                            }
                            placeholder={`Max ${pending}`}
                          />
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {transfer.notes ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-600">{transfer.notes}</CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canDispatchNow ? (
        <Button className="h-12 w-full text-base" onClick={dispatchTransfer} disabled={loading}>
          {loading ? "Dispatching..." : "Dispatch transfer"}
        </Button>
      ) : null}

      {canReceiveNow ? (
        <Card>
          <CardHeader>
            <CardTitle>Receive confirmation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={receiveTransfer} className="space-y-4">
              <p className="text-sm text-slate-500">
                Confirm quantities received at {toWarehouseName}. Serial-tracked lines must be
                received in full.
              </p>
              {transfer.lines.some((line) => line.product.serialTracking) ? (
                <div className="space-y-2">
                  {transfer.lines
                    .filter((line) => line.product.serialTracking)
                    .map((line) => {
                      const pending = Number(line.qty) - Number(line.receivedQty);
                      if (pending <= 0) return null;
                      return (
                        <Button
                          key={line.id}
                          type="button"
                          variant="outline"
                          className="h-12 w-full justify-start text-base"
                          onClick={() =>
                            setReceiveQty((current) => ({
                              ...current,
                              [line.id]: String(pending),
                            }))
                          }
                        >
                          Receive all {pending} × {line.product.displayName}
                        </Button>
                      );
                    })}
                </div>
              ) : null}
              <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
                {loading ? "Receiving..." : "Confirm receipt"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canCancelNow ? (
        <Button variant="destructive" onClick={cancelTransfer} disabled={loading}>
          Cancel draft
        </Button>
      ) : null}
    </div>
  );
}
