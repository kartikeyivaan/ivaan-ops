"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDispatchStatus } from "@/lib/dispatches";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";

type DispatchListItem = {
  id: string;
  dcNo: string;
  status: string;
  dispatchDate: string;
  totalValue: number;
  vehicleNo?: string | null;
  receiverName?: string | null;
  driverName?: string | null;
  customer: { customerName: string };
  proformaInvoice: { piNo: string };
  warehouse: { name: string };
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "DISPATCHED") return "success";
  if (status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

export function DispatchChallanArchive({
  initialDispatches,
}: {
  initialDispatches: DispatchListItem[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialDispatches);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const response = await fetch(`/api/dispatches?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) setRows(data);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, DispatchListItem[]>();
    for (const row of rows) {
      const key = dateKey(row.dispatchDate);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Delivery Challans</h1>
          <p className="text-sm text-slate-500">
            Archive of executed delivery challans, grouped by date.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/inventory/dispatches">
            <ArrowLeft className="h-4 w-4" />
            Today&apos;s Dispatch
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-5">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="DC no, PI, customer, vehicle, receiver"
              onKeyDown={(event) => {
                if (event.key === "Enter") void applyFilters();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromDate">From date</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toDate">To date</Label>
            <Input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="CANCEL_PENDING">Cancel Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-5">
            <Button onClick={() => void applyFilters()} disabled={loading} className="h-12">
              {loading ? "Loading..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-slate-500">
          <Package className="h-10 w-10" />
          <p>No delivery challans found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <Card key={date}>
              <CardContent className="pt-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {formatDocumentDate(date)}
                </h2>
                <Table responsive>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DC No</TableHead>
                      <TableHead>PI</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Receiver</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/inventory/dispatches/${row.id}`)}
                      >
                        <TableCell data-label="DC No" className="font-medium">
                          {row.dcNo}
                        </TableCell>
                        <TableCell data-label="PI">{row.proformaInvoice.piNo}</TableCell>
                        <TableCell data-label="Customer">{row.customer.customerName}</TableCell>
                        <TableCell data-label="Receiver">{row.receiverName || "—"}</TableCell>
                        <TableCell data-label="Vehicle">{row.vehicleNo || "—"}</TableCell>
                        <TableCell data-label="Status">
                          <Badge variant={statusVariant(row.status)}>
                            {formatDispatchStatus(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Value" className="text-right">
                          {formatCurrency(row.totalValue)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/inventory/dispatches/${row.id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
