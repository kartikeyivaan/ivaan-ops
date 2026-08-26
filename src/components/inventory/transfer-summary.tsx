import Link from "next/link";
import { ArrowLeft, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InterCompanyTransferSummaryRow } from "@/lib/transfer-service";

export function TransferSummary({
  rows,
  canCreate,
}: {
  rows: InterCompanyTransferSummaryRow[];
  canCreate: boolean;
}) {
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
            In-transit quantities between ISE and PCMV by product.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/transfers/all">
              <List className="mr-2 h-4 w-4" />
              View all transfers
            </Link>
          </Button>
          {canCreate ? (
            <Button asChild>
              <Link href="/inventory/transfers/new">New transfer</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product name</TableHead>
                <TableHead className="text-right">ISE → PCMV (Qty)</TableHead>
                <TableHead className="text-right">PCMV → ISE (Qty)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                    No in-transit stock between ISE and PCMV.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.iseToPcmv || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.pcmvToIse || "—"}
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
