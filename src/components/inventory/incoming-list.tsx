"use client";

import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
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

export function IncomingReceiptList({
  initialLots,
  canInward,
  showHistory,
  canExportSerials,
}: {
  initialLots: SerializedInventoryLot[];
  canInward: boolean;
  showHistory: boolean;
  canExportSerials: boolean;
}) {
  const lots = initialLots
    .filter((lot) => (showHistory ? Number(lot.receivedQuantity) > 0 : lot.status === "INCOMING"))
    .sort((a, b) => {
      if (!showHistory) return 0;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

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
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    {showHistory
                      ? "No received incoming lots in history."
                      : "No pending incoming lots to receive."}
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.lotNumber}</TableCell>
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
    </div>
  );
}
