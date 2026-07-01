"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus } from "lucide-react";
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

type DispatchListItem = {
  id: string;
  dcNo: string;
  status: string;
  dispatchDate: string;
  totalValue: number;
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

export function DispatchList({
  initialDispatches,
  canManage,
}: {
  initialDispatches: DispatchListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialDispatches);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const response = await fetch(`/api/dispatches?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) setRows(data);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatches</h1>
          <p className="text-sm text-slate-500">
            Dispatch from booked stock with serial scan and DC PDF.
          </p>
        </div>
        {canManage ? (
          <Button asChild className="h-12">
            <Link href="/inventory/dispatches/new">
              <Plus className="h-4 w-4" />
              New Dispatch
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="DC no, PI, customer"
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
          <div className="flex items-end md:col-span-2">
            <Button onClick={applyFilters} disabled={loading} className="h-12">
              {loading ? "Loading..." : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
              <Package className="h-10 w-10" />
              <p>No dispatches found.</p>
            </div>
          ) : (
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>DC No</TableHead>
                  <TableHead>PI</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/inventory/dispatches/${row.id}`)}
                  >
                    <TableCell data-label="DC No" className="font-medium">{row.dcNo}</TableCell>
                    <TableCell data-label="PI">{row.proformaInvoice.piNo}</TableCell>
                    <TableCell data-label="Customer">{row.customer.customerName}</TableCell>
                    <TableCell data-label="Date">{row.dispatchDate}</TableCell>
                    <TableCell data-label="Status">
                      <Badge variant={statusVariant(row.status)}>
                        {formatDispatchStatus(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Value" className="text-right">{formatCurrency(row.totalValue)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href={`/inventory/dispatches/${row.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
