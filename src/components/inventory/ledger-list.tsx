"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

type LedgerEntry = {
  id: string;
  transactionType: string;
  qty: string | number;
  createdAt: string;
  notes: string | null;
  product: { displayName: string };
  lot: { lotNumber: string } | null;
  createdBy: { name: string };
};

export function LedgerList({ entries }: { entries: LedgerEntry[] }) {
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
          <Link href="/inventory">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Inventory Ledger</h1>
        <p className="text-sm text-slate-500">Inward, transfer, damage and adjustment movements.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{entry.transactionType}</TableCell>
                  <TableCell>{entry.product.displayName}</TableCell>
                  <TableCell>{entry.lot?.lotNumber ?? "—"}</TableCell>
                  <TableCell>{Number(entry.qty)}</TableCell>
                  <TableCell>{entry.createdBy.name}</TableCell>
                  <TableCell>{entry.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
