"use client";

import { parseApiJson } from "@/lib/api-response";
import { useState } from "react";
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

function formatCurrency(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function PurchaseIncomingList({
  initialLots,
  companies,
  products,
  warehouses,
  vendors,
  defaultCompanyId,
  canCreate,
  canExportSerials,
  createDefaults,
}: {
  initialLots: SerializedInventoryLot[];
  companies: Company[];
  products: Product[];
  warehouses: Warehouse[];
  vendors: Vendor[];
  defaultCompanyId: string;
  canCreate: boolean;
  canExportSerials: boolean;
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
  const [editingLot, setEditingLot] = useState<SerializedInventoryLot | null>(null);

  async function refreshLots() {
    const response = await fetch("/api/inventory/incoming");
    if (response.ok) {
      const data = await parseApiJson<SerializedInventoryLot[]>(response);
      setLots(data);
    }
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
          onCreated={refreshLots}
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
                      {isEditableIncomingLot(lot) ? (
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
        </CardContent>
      </Card>

      {editingLot ? (
        <IncomingLotEditDialog
          lot={editingLot}
          products={products}
          warehouses={warehouses}
          vendors={vendors}
          onClose={() => setEditingLot(null)}
          onSaved={refreshLots}
          onDeleted={refreshLots}
        />
      ) : null}
    </div>
  );
}
