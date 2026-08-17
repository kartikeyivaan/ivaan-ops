"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import { IncomingSerialExportButton } from "@/components/inventory/incoming-serial-export-button";
import { IncomingLotEditDialog } from "@/components/purchase/incoming-lot-edit-dialog";

type Product = { id: string; displayName: string; gstRate: number };
type Warehouse = { id: string; name: string; companyId: string };
type Vendor = { id: string; vendorName: string };

export function IncomingReceiptList({
  initialLots,
  canInward,
  showHistory,
  canExportSerials,
  canEditHistory = false,
  products = [],
  warehouses = [],
  vendors = [],
}: {
  initialLots: SerializedInventoryLot[];
  canInward: boolean;
  showHistory: boolean;
  canExportSerials: boolean;
  canEditHistory?: boolean;
  products?: Product[];
  warehouses?: Warehouse[];
  vendors?: Vendor[];
}) {
  const [lots, setLots] = useState(initialLots);
  const [editingLot, setEditingLot] = useState<SerializedInventoryLot | null>(null);

  const visibleLots = lots
    .filter((lot) => (showHistory ? Number(lot.receivedQuantity) > 0 : lot.status === "INCOMING"))
    .sort((a, b) => {
      if (!showHistory) return 0;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  async function refreshLots() {
    const response = await fetch("/api/inventory/incoming");
    if (response.ok) {
      const data = await parseApiJson<SerializedInventoryLot[]>(response);
      setLots(data);
    }
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
            Record physical receipt of purchase lots created by the Purchase team.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={showHistory ? "/inventory/incoming" : "/inventory/incoming?view=history"}>
            <History className="h-4 w-4" />
            {showHistory ? "Back to Pending" : "History"}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    {showHistory
                      ? "No received incoming lots in history."
                      : "No pending incoming lots to receive."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleLots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      {canEditHistory && showHistory ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto p-0 font-medium text-slate-900 hover:bg-transparent hover:underline"
                          onClick={() => setEditingLot(lot)}
                        >
                          {lot.lotNumber}
                        </Button>
                      ) : (
                        lot.lotNumber
                      )}
                    </TableCell>
                    <TableCell>{lot.product.displayName}</TableCell>
                    <TableCell>{lot.warehouse.name}</TableCell>
                    <TableCell>{Number(lot.quantity)}</TableCell>
                    <TableCell>{Number(lot.receivedQuantity)}</TableCell>
                    <TableCell>
                      <Badge variant={lot.status === "INCOMING" ? "warning" : "success"}>
                        {lot.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
          onSaved={refreshLots}
        />
      ) : null}
    </div>
  );
}
