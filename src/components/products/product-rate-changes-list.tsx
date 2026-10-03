"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type { ProductRateChangeBatchDto } from "@/lib/product-rate-change-service";
import { formatDate } from "@/lib/utils";

function statusBadge(status: ProductRateChangeBatchDto["status"]) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="default">Draft</Badge>;
    case "PENDING":
      return <Badge variant="warning">Pending approval</Badge>;
    case "APPROVED":
      return <Badge variant="success">Approved</Badge>;
    case "REJECTED":
      return <Badge variant="danger">Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export function ProductRateChangesList({
  initialBatches,
  canCreate,
}: {
  initialBatches: ProductRateChangeBatchDto[];
  canCreate: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product rate changes</h1>
          <p className="text-sm text-slate-600">
            Submit standard and minimum price updates for dual approval before they apply globally.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/masters/products/rate-changes/new">
              <Plus className="mr-2 h-4 w-4" />
              New rate change
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Approvals</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialBatches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <Link
                      href={`/masters/products/rate-changes/${batch.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {batch.requestNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{statusBadge(batch.status)}</TableCell>
                  <TableCell>{batch.lines.length}</TableCell>
                  <TableCell>
                    {batch.status === "PENDING"
                      ? `${batch.approvalCount}/${batch.requiredApprovals}`
                      : "—"}
                  </TableCell>
                  <TableCell>{batch.createdByName}</TableCell>
                  <TableCell>{formatDate(batch.updatedAt)}</TableCell>
                </TableRow>
              ))}
              {initialBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    No rate change batches yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
