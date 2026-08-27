"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isInternalTransferLot } from "@/lib/inventory";
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import type { TransferRecord } from "@/lib/transfer-service";
import { IncomingSerialExportButton } from "@/components/inventory/incoming-serial-export-button";
import { IncomingTransferReceiveDialog } from "@/components/inventory/incoming-transfer-receive-dialog";
import { IncomingLotEditDialog } from "@/components/purchase/incoming-lot-edit-dialog";
import { formatDate } from "@/lib/utils";

type Product = { id: string; displayName: string; gstRate: number };
type Warehouse = { id: string; name: string; companyId: string };
type Vendor = { id: string; vendorName: string };

type IncomingTransferRow = {
  transfer: TransferRecord;
  fromWarehouseName: string;
  toWarehouseName: string;
  pendingQty: number;
};

type IncomingTransfersPayload = {
  items?: IncomingTransferRow[];
  canReceive?: boolean;
};

type IncomingLotsPage = {
  items?: SerializedInventoryLot[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const wrapCell = "max-w-[14rem] whitespace-normal break-words align-top";

export function IncomingReceiptList({
  initialLots,
  initialTotal,
  initialPage = 1,
  initialPageSize = 50,
  canInward,
  showHistory,
  canExportSerials,
  canEditHistory = false,
  products = [],
  warehouses = [],
  vendors = [],
  initialTransfers = [],
  canReceiveTransfers = false,
}: {
  initialLots: SerializedInventoryLot[];
  initialTotal?: number;
  initialPage?: number;
  initialPageSize?: number;
  canInward: boolean;
  showHistory: boolean;
  canExportSerials: boolean;
  canEditHistory?: boolean;
  products?: Product[];
  warehouses?: Warehouse[];
  vendors?: Vendor[];
  initialTransfers?: IncomingTransferRow[];
  canReceiveTransfers?: boolean;
}) {
  const [lots, setLots] = useState(initialLots);
  const [total, setTotal] = useState(initialTotal ?? initialLots.length);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [editingLot, setEditingLot] = useState<SerializedInventoryLot | null>(null);
  const [showInternalTransfers, setShowInternalTransfers] = useState(false);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [receivingTransfer, setReceivingTransfer] = useState<IncomingTransferRow | null>(null);
  const [transfersLoading, setTransfersLoading] = useState(false);

  useEffect(() => {
    setLots(initialLots);
    setTotal(initialTotal ?? initialLots.length);
    setPage(initialPage);
  }, [initialLots, initialTotal, initialPage]);

  useEffect(() => {
    setTransfers(initialTransfers);
  }, [initialTransfers]);

  const visibleLots = lots
    .filter(
      (lot) => showInternalTransfers || !isInternalTransferLot(lot.purchaseInvoiceNo),
    )
    .sort((a, b) => {
      if (!showHistory) return 0;
      const aReceived = a.receivedAt ?? a.updatedAt;
      const bReceived = b.receivedAt ?? b.updatedAt;
      return new Date(bReceived).getTime() - new Date(aReceived).getTime();
    });

  async function refreshLots(nextPage = page) {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", showHistory ? "CLOSED" : "INCOMING");
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));

    const response = await fetch(`/api/inventory/incoming?${params.toString()}`);
    setLoading(false);
    if (!response.ok) return;

    const data = await parseApiJson<IncomingLotsPage | SerializedInventoryLot[]>(response);
    const nextItems = Array.isArray(data) ? data : (data.items ?? data);
    const items = Array.isArray(nextItems) ? nextItems : [];
    setLots(items);
    setTotal(Array.isArray(data) ? data.length : (data.total ?? items.length));
    setPage(Array.isArray(data) ? nextPage : (data.page ?? nextPage));
  }

  async function refreshTransfers() {
    setTransfersLoading(true);
    const response = await fetch("/api/inventory/incoming/transfers");
    setTransfersLoading(false);
    if (!response.ok) return;

    const data = await parseApiJson<IncomingTransfersPayload>(response);
    setTransfers(data.items ?? []);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
            <Link href="/inventory">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to inventory
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Receive Incoming Material</h1>
          <p className="text-sm text-slate-500">
            Record physical receipt of purchase lots and internal stock transfers dispatched to
            this company.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showInternalTransfers ? "default" : "outline"}
            onClick={() => setShowInternalTransfers((current) => !current)}
          >
            {showInternalTransfers
              ? "Hide internal transfer"
              : "Show internal transfer as well"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={showHistory ? "/inventory/incoming" : "/inventory/incoming?view=history"}>
              <History className="h-4 w-4" />
              {showHistory ? "Back to Pending" : "History"}
            </Link>
          </Button>
        </div>
      </div>

      {!showHistory ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Internal transfers awaiting receipt
                </h2>
                <p className="text-sm text-slate-500">
                  Material dispatched from another warehouse via a manual stock transfer.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={transfersLoading}
                onClick={() => void refreshTransfers()}
              >
                {transfersLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Dispatched</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No internal transfers awaiting receipt.
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((row) => {
                    const productSummary = row.transfer.lines
                      .map((line) => line.product.displayName)
                      .join(", ");
                    const dispatchedAt =
                      row.transfer.dispatchedAt ?? row.transfer.updatedAt ?? row.transfer.createdAt;

                    return (
                      <TableRow key={row.transfer.id}>
                        <TableCell className="font-medium">{row.transfer.transferNumber}</TableCell>
                        <TableCell className={wrapCell}>
                          <div>
                            {row.transfer.fromCompany.code} ({row.fromWarehouseName})
                          </div>
                          <div className="text-xs text-slate-500">
                            → {row.transfer.toCompany.code} ({row.toWarehouseName})
                          </div>
                        </TableCell>
                        <TableCell className={`min-w-[12rem] max-w-[22rem] ${wrapCell}`}>
                          {productSummary}
                        </TableCell>
                        <TableCell className="align-top">{row.pendingQty}</TableCell>
                        <TableCell className={`align-top ${wrapCell}`}>
                          {formatDate(dispatchedAt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="warning">{row.transfer.status}</Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          {canReceiveTransfers ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReceivingTransfer(row)}
                            >
                              Receive
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Date Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">
                    {showHistory
                      ? "No received incoming lots in history."
                      : "No pending incoming lots to receive."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleLots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className={`font-medium ${wrapCell}`}>
                      {canEditHistory && showHistory ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto whitespace-normal p-0 text-left font-medium text-slate-900 hover:bg-transparent hover:underline"
                          onClick={() => setEditingLot(lot)}
                        >
                          {lot.lotNumber}
                        </Button>
                      ) : (
                        lot.lotNumber
                      )}
                    </TableCell>
                    <TableCell className={`min-w-[12rem] max-w-[22rem] ${wrapCell}`}>
                      {lot.product.displayName}
                    </TableCell>
                    <TableCell className={wrapCell}>
                      {lot.vendor?.vendorName ?? "—"}
                    </TableCell>
                    <TableCell className={wrapCell}>
                      <div>{lot.warehouse.name}</div>
                      <div className="text-xs text-slate-500">{lot.company.code}</div>
                    </TableCell>
                    <TableCell className="align-top">{Number(lot.quantity)}</TableCell>
                    <TableCell className="align-top">{Number(lot.receivedQuantity)}</TableCell>
                    <TableCell className={`align-top ${wrapCell}`}>
                      {lot.receivedAt
                        ? formatDate(lot.receivedAt)
                        : Number(lot.receivedQuantity) > 0
                          ? formatDate(lot.updatedAt)
                          : "—"}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={lot.status === "INCOMING" ? "warning" : "success"}>
                        {lot.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        {canInward && lot.status === "INCOMING" ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/inventory/incoming/${lot.id}`}>Receive</Link>
                          </Button>
                        ) : null}
                        <IncomingSerialExportButton
                          lotId={lot.id}
                          serialTracking={lot.product.serialTracking}
                          receivedQuantity={Number(lot.receivedQuantity)}
                          canExport={canExportSerials}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="px-4 pb-4">
            <ListPaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                void refreshLots(nextPage);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {editingLot ? (
        <IncomingLotEditDialog
          lot={editingLot}
          products={products}
          warehouses={warehouses}
          vendors={vendors}
          allowDelete={false}
          onClose={() => setEditingLot(null)}
          onSaved={() => void refreshLots()}
        />
      ) : null}

      {receivingTransfer ? (
        <IncomingTransferReceiveDialog
          row={receivingTransfer}
          canViewSerials={canExportSerials}
          onClose={() => setReceivingTransfer(null)}
          onReceived={() => void refreshTransfers()}
        />
      ) : null}
    </div>
  );
}
