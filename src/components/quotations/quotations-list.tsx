"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
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
import { formatQuotationStatus } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";

type QuotationListItem = {
  id: string;
  quotationNo: string;
  revisionNo: number;
  status: string;
  quotationDate: string;
  expiryDate: string;
  totalValue: number;
  customer: { customerName: string; customerCode: string };
  salesUser: { name: string };
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "SENT") return "success";
  if (status === "EXPIRED") return "danger";
  if (status === "CONVERTED") return "warning";
  return "default";
}

export function QuotationsList({
  initialQuotations,
  canManage,
}: {
  initialQuotations: QuotationListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [quotations, setQuotations] = useState(initialQuotations);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);

    const response = await fetch(`/api/quotations?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setQuotations(data);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-sm text-slate-500">
            Excel-style quotation builder with 3-day validity and PDF export.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/sales/quotations/new">
              <Plus className="h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        ) : null}
      </div>

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Quotation no or customer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="EXPIRED">Expired</option>
              <option value="CONVERTED">Converted</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={applyFilters} disabled={loading}>
              Apply Filters
            </Button>
          </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500">
                    No quotations found.
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation) => (
                  <TableRow key={quotation.id}>
                    <TableCell className="font-medium">
                      {quotation.quotationNo}
                      {quotation.revisionNo > 1 ? ` (R${quotation.revisionNo})` : ""}
                    </TableCell>
                    <TableCell>{quotation.customer.customerName}</TableCell>
                    <TableCell>{quotation.salesUser.name}</TableCell>
                    <TableCell>{formatDocumentDate(quotation.quotationDate)}</TableCell>
                    <TableCell>{formatDocumentDate(quotation.expiryDate)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(quotation.status)}>
                        {formatQuotationStatus(quotation.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{quotation.totalValue.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/sales/quotations/${quotation.id}`)}
                      >
                        <FileText className="h-4 w-4" />
                        View
                      </Button>
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
