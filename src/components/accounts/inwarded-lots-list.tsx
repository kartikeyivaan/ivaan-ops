"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import { InwardedLotDetailDialog } from "@/components/accounts/inwarded-lot-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import { formatCurrency } from "@/lib/quotations";
import { formatDate, formatDocumentDate } from "@/lib/utils";

type InwardedLotsPage = {
  items?: SerializedInventoryLot[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const wrapCell = "max-w-[14rem] whitespace-normal break-words align-top";

export function AccountsInwardedLotsList({
  initialLots,
  initialTotal,
  initialPage = 1,
  initialPageSize = 50,
}: {
  initialLots: SerializedInventoryLot[];
  initialTotal: number;
  initialPage?: number;
  initialPageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [lots, setLots] = useState(initialLots);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const skipSearchFetch = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setLots(initialLots);
    setTotal(initialTotal);
    setPage(initialPage);
  }, [initialLots, initialTotal, initialPage]);

  useEffect(() => {
    if (skipSearchFetch.current) {
      skipSearchFetch.current = false;
      return;
    }
    void refreshLots(1, debouncedQ);
    // Search changes reload from page 1; pagination calls refreshLots directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  async function refreshLots(nextPage = page, search = debouncedQ) {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));

    const response = await fetch(`/api/accounts/inwarded-lots?${params.toString()}`);
    setLoading(false);
    if (!response.ok) return;

    const data = await parseApiJson<InwardedLotsPage>(response);
    const items = data.items ?? [];
    setLots(items);
    setTotal(data.total ?? items.length);
    setPage(data.page ?? nextPage);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inwarded Lots</h1>
        <p className="text-sm text-slate-600">
          Purchase lots received into inventory, with invoice, cost, quantity and serial details.
        </p>
      </div>

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="inwarded-lot-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="inwarded-lot-search"
              className="pl-9"
              placeholder="Lot number, invoice, vendor or product"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
        </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Vendor / Invoice</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">
                    {loading ? "Loading inwarded lots…" : "No inwarded lots found."}
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className={`font-medium ${wrapCell}`}>
                      <button
                        type="button"
                        className="text-left font-medium text-emerald-800 hover:underline"
                        onClick={() => setSelectedLotId(lot.id)}
                      >
                        {lot.lotNumber}
                      </button>
                    </TableCell>
                    <TableCell className={wrapCell}>
                      <div>{lot.vendor?.vendorName ?? "—"}</div>
                      <div className="text-xs text-slate-500">{lot.purchaseInvoiceNo}</div>
                    </TableCell>
                    <TableCell className={`min-w-[12rem] ${wrapCell}`}>
                      {lot.product.displayName}
                    </TableCell>
                    <TableCell className={wrapCell}>
                      <div>{lot.warehouse.name}</div>
                      <div className="text-xs text-slate-500">{lot.company.code}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div>{Number(lot.receivedQuantity)} / {Number(lot.quantity)}</div>
                      {Number(lot.damagedQuantity) > 0 ? (
                        <div className="text-xs text-amber-700">
                          Damaged {Number(lot.damagedQuantity)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div>{formatCurrency(lot.totalPurchaseCost)}</div>
                      <div className="text-xs text-slate-500">
                        {formatCurrency(lot.unitPurchaseRate)} / unit
                      </div>
                    </TableCell>
                    <TableCell className={`align-top ${wrapCell}`}>
                      {lot.receivedAt
                        ? formatDate(lot.receivedAt)
                        : Number(lot.receivedQuantity) > 0
                          ? formatDate(lot.updatedAt)
                          : "—"}
                      <div className="text-xs text-slate-500">
                        PO {formatDocumentDate(lot.purchaseDate)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={lot.status === "INCOMING" ? "warning" : "success"}>
                        {lot.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <Button size="sm" variant="outline" onClick={() => setSelectedLotId(lot.id)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="px-4 pb-4">
            <ListPaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                void refreshLots(nextPage);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {selectedLotId ? (
        <InwardedLotDetailDialog lotId={selectedLotId} onClose={() => setSelectedLotId(null)} />
      ) : null}
    </div>
  );
}
