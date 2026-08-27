"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TransferRecord } from "@/lib/transfer-service";

type IncomingTransferRow = {
  transfer: TransferRecord;
  fromWarehouseName: string;
  toWarehouseName: string;
  pendingQty: number;
};

export function IncomingTransferReceiveDialog({
  row,
  canViewSerials,
  onClose,
  onReceived,
}: {
  row: IncomingTransferRow;
  canViewSerials: boolean;
  onClose: () => void;
  onReceived: () => void;
}) {
  const { transfer, fromWarehouseName, toWarehouseName } = row;
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pendingLines = useMemo(
    () =>
      transfer.lines
        .map((line) => ({
          ...line,
          pending: Number(line.qty) - Number(line.receivedQty),
        }))
        .filter((line) => line.pending > 0),
    [transfer.lines],
  );

  function receiveAllSerialLines() {
    const next: Record<string, string> = {};
    for (const line of pendingLines) {
      if (line.product.serialTracking) {
        next[line.id] = String(line.pending);
      }
    }
    setReceiveQty((current) => ({ ...current, ...next }));
  }

  async function confirmReceipt() {
    setLoading(true);
    setError("");

    const lines = pendingLines
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

    onReceived();
    onClose();
  }

  const hasSerialLines = pendingLines.some((line) => line.product.serialTracking);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const line of pendingLines) {
      if (line.product.serialTracking) {
        next[line.id] = String(line.pending);
      }
    }
    setReceiveQty(next);
    setError("");
  }, [pendingLines, transfer.id]);

  return (
    <Modal onClose={onClose} size="2xl">
      <ModalHeader title={`Receive transfer ${transfer.transferNumber}`} onClose={onClose} />
      <ModalBody className="space-y-4">
        <p className="text-sm text-slate-500">
          {transfer.fromCompany.code} ({fromWarehouseName}) → {transfer.toCompany.code} (
          {toWarehouseName})
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Pending</TableHead>
              {canViewSerials ? <TableHead>Serials</TableHead> : null}
              <TableHead>Receive now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingLines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.product.displayName}</TableCell>
                <TableCell>{line.pending}</TableCell>
                {canViewSerials ? (
                  <TableCell className="max-w-xs truncate text-xs text-slate-500">
                    {line.serials.map((row) => row.serial.serialNumber).join(", ") || "—"}
                  </TableCell>
                ) : null}
                <TableCell>
                  {line.product.serialTracking ? (
                    <span className="text-sm text-slate-500">All {line.pending}</span>
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      max={line.pending}
                      step="any"
                      className="h-10 w-24"
                      value={receiveQty[line.id] ?? ""}
                      onChange={(event) =>
                        setReceiveQty((current) => ({
                          ...current,
                          [line.id]: event.target.value,
                        }))
                      }
                      placeholder={`Max ${line.pending}`}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hasSerialLines ? (
          <Button type="button" variant="outline" onClick={receiveAllSerialLines}>
            Select all serial-tracked lines
          </Button>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void confirmReceipt()} disabled={loading}>
          {loading ? "Receiving..." : "Confirm receipt"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
