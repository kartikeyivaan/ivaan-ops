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
import { formatDocumentDate } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
  completedDate: string | null;
  ageingDays: number;
  dispatch: { dcNo: string; dispatchDate: string };
  invoiceHandover: { invoiceNumber: string | null; invoiceDate: string | null };
  customer: { customerName: string };
  completedBy: { name: string } | null;
};

export function DocumentationHistoryList({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Documentation History</h1>
          <p className="text-sm text-slate-500">
            Completed records marked DCR Issued or Not Required.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/documentation">
            <ArrowLeft className="h-4 w-4" />
            Back to Documentation
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>DC No</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Invoice date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Ageing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell>
                      <Link href={`/documentation/${row.id}`} className="font-medium text-slate-900 hover:underline">
                        {row.customer.customerName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/documentation/${row.id}`} className="text-slate-700 hover:underline">
                        {row.dispatch.dcNo}
                      </Link>
                    </TableCell>
                    <TableCell>{row.invoiceHandover.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>
                      {row.invoiceHandover.invoiceDate
                        ? formatDocumentDate(row.invoiceHandover.invoiceDate)
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium text-emerald-700">
                      {row.status.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      {row.completedDate ? formatDocumentDate(row.completedDate) : "—"}
                    </TableCell>
                    <TableCell>{row.completedBy?.name ?? "—"}</TableCell>
                    <TableCell>{row.ageingDays} day{row.ageingDays === 1 ? "" : "s"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-slate-500">No completed documentation records.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
