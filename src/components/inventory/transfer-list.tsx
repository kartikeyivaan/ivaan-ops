"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Plus } from "lucide-react";
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
import type { TransferRecord } from "@/lib/transfer-service";

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case "DRAFT":
      return "default";
    case "DISPATCHED":
    case "PARTIALLY_RECEIVED":
      return "warning";
    case "RECEIVED":
      return "success";
    default:
      return "danger";
  }
}

export function TransferList({
  initialTransfers,
  activeCompanyId,
  canCreate,
}: {
  initialTransfers: TransferRecord[];
  activeCompanyId: string;
  canCreate: boolean;
}) {
  const [transfers, setTransfers] = useState(initialTransfers);
  const [direction, setDirection] = useState<"all" | "outgoing" | "incoming">("all");
  const [loading, setLoading] = useState(false);

  async function applyFilter(nextDirection: typeof direction) {
    setDirection(nextDirection);
    setLoading(true);
    const params = new URLSearchParams();
    if (nextDirection !== "all") params.set("direction", nextDirection);
    const response = await fetch(`/api/inventory/transfers?${params.toString()}`);
    setLoading(false);
    if (response.ok) setTransfers(await response.json());
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
          <h1 className="text-2xl font-bold text-slate-900">Stock Transfers</h1>
          <p className="text-sm text-slate-500">
            Inter-warehouse and inter-company transfers with receive confirmation.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/inventory/transfers/new">
              <Plus className="mr-2 h-4 w-4" />
              New transfer
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "outgoing", "incoming"] as const).map((value) => (
          <Button
            key={value}
            variant={direction === value ? "default" : "outline"}
            size="sm"
            onClick={() => applyFilter(value)}
            disabled={loading}
          >
            {value === "all" ? "All" : value === "outgoing" ? "Outgoing" : "Incoming"}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                    No transfers found.
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => {
                  const isOutgoing = transfer.fromCompanyId === activeCompanyId;
                  const lineCount = transfer.lines.length;
                  const totalQty = transfer.lines.reduce(
                    (sum, line) => sum + Number(line.qty),
                    0,
                  );

                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-medium">{transfer.transferNumber}</TableCell>
                      <TableCell>
                        <Badge variant={isOutgoing ? "default" : "warning"}>
                          {isOutgoing ? "Outgoing" : "Incoming"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {transfer.fromCompany.code} → {transfer.toCompany.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lineCount} line{lineCount === 1 ? "" : "s"} · {totalQty} units
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(transfer.status)}>{transfer.status}</Badge>
                      </TableCell>
                      <TableCell>{new Date(transfer.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/inventory/transfers/${transfer.id}`}>
                            <ArrowRightLeft className="mr-1 h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
