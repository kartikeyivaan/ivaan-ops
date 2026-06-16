"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

export function IncomingReceiptList({
  initialLots,
  canInward,
}: {
  initialLots: SerializedInventoryLot[];
  canInward: boolean;
}) {
  const [lots, setLots] = useState(
    initialLots.filter((lot) => lot.status === "INCOMING"),
  );

  async function refreshLots() {
    const response = await fetch("/api/inventory/incoming?status=INCOMING");
    if (response.ok) setLots(await response.json());
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
        {canInward ? (
          <Button variant="outline" onClick={() => refreshLots()}>
            Refresh
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    No pending incoming lots to receive.
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
                      {canInward && lot.status === "INCOMING" ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/inventory/incoming/${lot.id}`}>Receive</Link>
                        </Button>
                      ) : null}
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
