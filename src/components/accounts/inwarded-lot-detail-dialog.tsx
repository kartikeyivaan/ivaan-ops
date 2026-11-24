"use client";

import { useEffect, useState } from "react";
import { parseApiJson } from "@/lib/api-response";
import { IncomingSerialExportButton } from "@/components/inventory/incoming-serial-export-button";
import { Badge } from "@/components/ui/badge";
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
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import { formatCurrency } from "@/lib/quotations";
import { formatDate, formatDocumentDate } from "@/lib/utils";

export type InwardedLotRecordedSerial = {
  serialId: string;
  serialNumber: string;
  createdAt: string;
  status: string;
  currentLotNumber: string;
  stillOnLot: boolean;
};

export type InwardedLotDetail = SerializedInventoryLot & {
  recordedSerials: InwardedLotRecordedSerial[];
  canCorrectSerials?: boolean;
};

export function InwardedLotDetailDialog({
  lotId,
  onClose,
}: {
  lotId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InwardedLotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InwardedLotRecordedSerial | null>(null);
  const [newSerialNumber, setNewSerialNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  async function saveCorrection() {
    if (!editing || !detail) return;
    setSaving(true);
    setEditError("");
    const response = await fetch("/api/inventory/serials/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serialId: editing.serialId, newSerialNumber }),
    });
    const data = await parseApiJson<{ serialNumber?: string; message?: string }>(response);
    setSaving(false);
    if (!response.ok || !data.serialNumber) {
      setEditError(data.message ?? "Unable to correct serial number.");
      return;
    }
    const corrected = data.serialNumber;
    setDetail({
      ...detail,
      recordedSerials: detail.recordedSerials.map((row) =>
        row.serialId === editing.serialId ? { ...row, serialNumber: corrected } : row,
      ),
    });
    setEditing(null);
    setNewSerialNumber("");
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/accounts/inwarded-lots/${lotId}`);
      const data = await parseApiJson<InwardedLotDetail & { message?: string }>(response);
      if (cancelled) return;
      if (!response.ok) {
        setError(data.message ?? "Unable to load lot details.");
        setDetail(null);
        setLoading(false);
        return;
      }
      setDetail(data);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  const serials = detail?.recordedSerials ?? [];

  return (
    <Modal onClose={onClose} size="2xl">
      <ModalHeader
        title={detail?.lotNumber ?? "Lot details"}
        description={
          detail
            ? `${detail.product.displayName} · ${detail.vendor?.vendorName ?? "No vendor"}`
            : "Loading inwarded lot details…"
        }
        onClose={onClose}
      />
      <ModalBody className="space-y-6">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Status" value={detail.status} />
              <DetailField label="Company" value={`${detail.company.code} · ${detail.company.name}`} />
              <DetailField label="Warehouse" value={detail.warehouse.name} />
              <DetailField label="Vendor" value={detail.vendor?.vendorName ?? "—"} />
              <DetailField label="Vendor GST" value={detail.vendor?.gst ?? "—"} />
              <DetailField label="Purchase invoice" value={detail.purchaseInvoiceNo} />
              <DetailField label="Purchase date" value={formatDocumentDate(detail.purchaseDate)} />
              <DetailField
                label="Date received"
                value={
                  detail.receivedAt
                    ? formatDate(detail.receivedAt)
                    : Number(detail.receivedQuantity) > 0
                      ? formatDate(detail.updatedAt)
                      : "—"
                }
              />
              <DetailField label="Recorded by" value={detail.createdBy.name} />
              <DetailField
                label="Product"
                value={`${detail.product.displayName} (${detail.product.brand.name} · ${detail.product.category.name})`}
                className="sm:col-span-2 lg:col-span-3"
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Expected qty" value={String(detail.quantity)} />
              <DetailField label="Received qty" value={String(detail.receivedQuantity)} />
              <DetailField label="Damaged qty" value={String(detail.damagedQuantity)} />
              <DetailField
                label="Pending qty"
                value={String(
                  Number(detail.quantity) -
                    Number(detail.receivedQuantity) -
                    Number(detail.damagedQuantity),
                )}
              />
              <DetailField label="Unit purchase rate" value={formatCurrency(detail.unitPurchaseRate)} />
              <DetailField label="Transport" value={formatCurrency(detail.transportCharges)} />
              <DetailField label="Commission" value={formatCurrency(detail.commissionCharges)} />
              <DetailField label="Total purchase cost" value={formatCurrency(detail.totalPurchaseCost)} />
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900">
                  Serial numbers ({serials.length})
                </h4>
                <IncomingSerialExportButton
                  lotId={detail.id}
                  serialTracking={detail.product.serialTracking}
                  receivedQuantity={Number(detail.receivedQuantity)}
                  canExport
                />
              </div>
              {detail.product.serialTracking ? (
                <>
                {serials.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Serial number</TableHead>
                        <TableHead>Recorded</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Current lot</TableHead>
                        {detail.canCorrectSerials ? <TableHead>Correction</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serials.map((serial, index) => (
                        <TableRow key={serial.serialId}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{serial.serialNumber}</TableCell>
                          <TableCell>{formatDate(serial.createdAt)}</TableCell>
                          <TableCell>
                            <Badge variant={serial.stillOnLot ? "success" : "warning"}>
                              {serial.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {serial.stillOnLot ? detail.lotNumber : serial.currentLotNumber}
                          </TableCell>
                          {detail.canCorrectSerials ? (
                            <TableCell>
                              {serial.stillOnLot && serial.status === "AVAILABLE" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditing(serial);
                                    setNewSerialNumber(serial.serialNumber);
                                    setEditError("");
                                  }}
                                >
                                  Correct
                                </Button>
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
                {editing ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">
                      Correct serial {editing.serialNumber}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={newSerialNumber}
                        onChange={(event) => setNewSerialNumber(event.target.value)}
                        placeholder="Correct serial number"
                        className="max-w-xs"
                      />
                      <Button onClick={() => void saveCorrection()} disabled={saving}>
                        {saving ? "Saving…" : "Save correction"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setEditError("");
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </div>
                    {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
                  </div>
                ) : null}
                {!serials.length ? (
                  <p className="text-sm text-slate-500">No serial numbers recorded on this lot.</p>
                ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">This product is not serial-tracked.</p>
              )}
            </section>
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-200 px-3 py-2 ${className ?? ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
