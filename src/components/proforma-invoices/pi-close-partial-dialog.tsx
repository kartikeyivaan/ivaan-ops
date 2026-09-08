"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";

export type ClosePartialLine = {
  id: string;
  displayName: string;
  qty: number;
  dispatchedQty: number;
  remainingQty: number;
};

export function PiClosePartialDialog({
  piId,
  piNo,
  lines,
  open,
  onOpenChange,
  onClosed,
}: {
  piId: string;
  piNo: string;
  lines: ClosePartialLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");

  const remainingLines = lines.filter((line) => line.remainingQty > 0);

  async function confirmClose() {
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/proforma-invoices/${piId}/close-partial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remarks: remarks.trim() || undefined,
      }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to close this PI.");
      return;
    }

    onOpenChange(false);
    onClosed();
  }

  if (!open) return null;

  return (
    <Modal onClose={() => onOpenChange(false)} size="md">
      <ModalHeader title="Close PI with Partial Dispatch" onClose={() => onOpenChange(false)} />
      <ModalBody className="space-y-3">
        <p className="text-sm text-slate-600">
          Close <span className="font-medium text-slate-900">{piNo}</span> as completed with a
          partial dispatch? Remaining quantity will be released from holding so it can be booked
          on other orders.
        </p>
        {remainingLines.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {remainingLines.map((line) => (
              <li key={line.id}>
                {line.displayName}: {line.remainingQty} of {line.qty} remaining
                {line.dispatchedQty > 0 ? ` (${line.dispatchedQty} already dispatched)` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm text-slate-500">
          Confirmed delivery challans stay as they are. Further dispatch on this PI will be
          blocked.
        </p>
        <div className="space-y-2">
          <Label htmlFor="close-partial-remarks">Reason (optional)</Label>
          <textarea
            id="close-partial-remarks"
            className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="e.g. Remaining qty could not fit on the pallet / vehicle"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            maxLength={500}
          />
        </div>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" disabled={loading} onClick={() => void confirmClose()}>
          {loading ? "Closing…" : "Close PI"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
