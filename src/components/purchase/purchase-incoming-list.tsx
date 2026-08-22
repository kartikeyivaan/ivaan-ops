"use client";

import { parseApiJson } from "@/lib/api-response";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { IncomingCreateForm } from "@/components/purchase/incoming-create-form";
import {
  IncomingLotEditDialog,
  isEditableIncomingLot,
} from "@/components/purchase/incoming-lot-edit-dialog";
import { IncomingSerialExportButton } from "@/components/inventory/incoming-serial-export-button";

type Company = { id: string; name: string; code: string };
type Product = { id: string; displayName: string; gstRate: number };
type Warehouse = { id: string; name: string; companyId: string };
type Vendor = { id: string; vendorName: string };

type IncomingLotsPage = {
  items?: SerializedInventoryLot[];
  total?: number;
  page?: number;
  pageSize?: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function PurchaseIncomingList({
  initialLots,
  initialTotal,
  initialPage = 1,
  initialPageSize = 50,
  companies,
  products,
  warehouses,
  vendors,
  defaultCompanyId,
  canCreate,
  canExportSerials,
  canEditClosedLots = false,
  createDefaults,
}: {
  initialLots: SerializedInventoryLot[];
  initialTotal?: number;
  initialPage?: number;
  initialPageSize?: number;
  companies: Company[];
  products: Product[];
  warehouses: Warehouse[];
  vendors: Vendor[];
  defaultCompanyId: string;
  canCreate: boolean;
  canExportSerials: boolean;
  canEditClosedLots?: boolean;
  createDefaults?: {
    companyId?: string;
    warehouseId?: string;
    productId?: string;
    quantity?: string;
    purchaseRequestLineId?: string;
    purchaseRequestId?: string;
  };
}) {
  const [lots, setLots] = useState(initialLots);
  const [total, setTotal] = useState(initialTotal ?? initialLots.length);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [editingLot, setEditingLot] = useState<SerializedInventoryLot | null>(null);

  useEffect(() => {
    setLots(initialLots);
    setTotal(initialTotal ?? initialLots.length);
    setPage(initialPage);
  }, [initialLots, initialTotal, initialPage]);

  async function refreshLots(nextPage = page) {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "INCOMING");
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));

    const response = await fetch(`/api/inventory/incoming?${params.toString()}`);
    setLoading(false);
    if (!response.ok) return;

    const data = await parseApiJson<IncomingLotsPage | SerializedInventoryLot[]>(response);
    const nextItems = Array.isArray(data) ? data : (data.items ?? data);
    const items = Array.isArray(nextItems) ? nextItems : [];
    setLots(items);
    setTotal(Array.isArray(data) ? data.length : (data.total ?? items.length));
    setPage(Array.isArray(data) ? nextPage : (data.page ?? nextPage));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Incoming Material</h1>
        <p className="text-sm text-slate-500">
          Record expected purchases here. Warehouse teams receive material from Inventory.
        </p>
      </div>

      {canCreate ? (
        <IncomingCreateForm
          companies={companies}
          products={products}
          warehouses={warehouses}
          vendors={vendors}
          defaultCompanyId={defaultCompanyId}
          defaults={createDefaults}
          onCreated={() => {
            setPage(1);
            void refreshLots(1);
          }}
        />
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Unit Rate</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-slate-500">
                    No incoming lots recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      {isEditableIncomingLot(lot, canEditClosedLots) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto p-0 font-medium text-slate-900 hover:bg-transparent hover:underline"
                          onClick={() => setEditingLot(lot)}
                        >
                          {lot.lotNumber}
                        </Button>
                      ) : (
                        lot.lotNumber
                      )}
                    </TableCell>
                    <TableCell>{lot.company.code}</TableCell>
                    <TableCell>{lot.product.displayName}</TableCell>
                    <TableCell>{lot.warehouse.name}</TableCell>
                    <TableCell>{Number(lot.quantity)}</TableCell>
                    <TableCell>{formatCurrency(Number(lot.unitPurchaseRate))}</TableCell>
                    <TableCell>{formatCurrency(Number(lot.totalPurchaseCost))}</TableCell>
                    <TableCell>{Number(lot.receivedQuantity)}</TableCell>
                    <TableCell>
                      <Badge variant={lot.status === "INCOMING" ? "warning" : "success"}>
                        {lot.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <IncomingSerialExportButton
                        lotId={lot.id}
                        serialTracking={lot.product.serialTracking}
                        receivedQuantity={Number(lot.receivedQuantity)}
                        canExport={canExportSerials}
                      />
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

      {editingLot ? (
        <IncomingLotEditDialog
          lot={editingLot}
          products={products}
          warehouses={warehouses}
          vendors={vendors}
          onClose={() => setEditingLot(null)}
          onSaved={() => void refreshLots()}
          onDeleted={() => void refreshLots()}
          allowDelete={editingLot.status === "INCOMING"}
        />
      ) : null}
    </div>
  );
}
