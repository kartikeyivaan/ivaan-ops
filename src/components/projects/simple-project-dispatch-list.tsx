"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatProjectDispatchStatus } from "@/lib/projects";
import { formatDocumentDate } from "@/lib/utils";

type DispatchRow = {
  id: string;
  dispatchNo: string;
  status: string;
  createdAt: string;
  dispatchedAt?: string | null;
  receiverName?: string | null;
  serialCount?: number;
  project: {
    projectNo: string;
    customerName: string;
  };
  lines: Array<{ serials: unknown[] }>;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "DISPATCHED") return "success";
  if (status === "PENDING_APPROVAL" || status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function SimpleProjectDispatchList({
  initialRows,
  canPrepare,
}: {
  initialRows: DispatchRow[];
  canPrepare: boolean;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return initialRows;
    return initialRows.filter((row) => {
      const haystack = [
        row.dispatchNo,
        row.project.projectNo,
        row.project.customerName,
        row.receiverName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [initialRows, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Simple Project Dispatch</h1>
          <p className="text-sm text-slate-500">
            Record material going to projects. Delivery challans feed DCR Issuance and invoicing.
          </p>
        </div>
        {canPrepare ? (
          <Button asChild>
            <Link href="/projects/dispatch/new">
              <Plus className="h-4 w-4" />
              New dispatch
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search challan, project no., customer…"
          className="h-11 pl-10"
          aria-label="Search project dispatches"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 py-16 text-slate-500">
          <Package className="h-10 w-10 text-slate-300" />
          <p>No project dispatches yet.</p>
          {canPrepare ? (
            <Button asChild>
              <Link href="/projects/dispatch/new">Create first dispatch</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challan</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Serials</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const serialCount =
                  row.serialCount ??
                  row.lines.reduce((sum, line) => sum + line.serials.length, 0);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.dispatchNo}</TableCell>
                    <TableCell>{row.project.projectNo}</TableCell>
                    <TableCell>{row.project.customerName}</TableCell>
                    <TableCell className="text-right">{serialCount}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {formatProjectDispatchStatus(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDocumentDate(row.dispatchedAt ?? row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/projects/dispatch/${row.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
