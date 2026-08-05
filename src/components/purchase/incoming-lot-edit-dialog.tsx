"use client";

import { useEffect, useMemo, useState } from "react";
import { parseApiJson } from "@/lib/api-response";
import { calculateTotalPurchaseCost } from "@/lib/inventory";
import { evaluateCellInput } from "@/lib/cell-formula";
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { FormulaInput, resolveFormulaField } from "@/components/ui/formula-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";

type Product = { id: string; displayName: string; gstRate: number };
type Warehouse = { id: string; name: string; companyId: string };
type Vendor = { id: string; vendorName: string };

type SimilarIncomingLot = {
  lotNumber: string;
  purchaseInvoiceNo: string;
  productName: string;
  vendorName: string | null;
  purchaseDate: string;
  quantity: number;
};

type IncomingApiResponse = {
  code?: string;
  message?: string;
  details?: {
    matches?: SimilarIncomingLot[];
  };
};

function formatSimilarMatches(matches: SimilarIncomingLot[]) {
  return matches
    .map(
      (match) =>
        `- ${match.lotNumber} (${match.purchaseInvoiceNo}): ${match.productName}, qty ${match.quantity}`,
    )
    .join("\n");
}

function formatDateInput(value: string) {
  return value.slice(0, 10);
}

export function IncomingLotEditDialog({
  lot,
  products,
  warehouses,
  vendors,
  onClose,
  onSaved,
  onDeleted,
  allowDelete = true,
}: {
  lot: SerializedInventoryLot;
  products: Product[];
  warehouses: Warehouse[];
  vendors: Vendor[];
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
  allowDelete?: boolean;
}) {
  const companyWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.companyId === lot.company.id),
    [warehouses, lot.company.id],
  );

  const [form, setForm] = useState({
    warehouseId: lot.warehouse.id,
    vendorId: lot.vendor?.id ?? "",
    purchaseInvoiceNo: lot.purchaseInvoiceNo ?? "",
    purchaseDate: formatDateInput(lot.purchaseDate),
    expectedMinDate: lot.expectedMinDate ? formatDateInput(lot.expectedMinDate) : "",
    expectedMaxDate: lot.expectedMaxDate ? formatDateInput(lot.expectedMaxDate) : "",
    productId: lot.product.id,
    quantity: String(lot.quantity),
    unitPurchaseRate: String(lot.unitPurchaseRate),
    transportCharges: String(lot.transportCharges),
    commissionCharges: String(lot.commissionCharges),
  });
  const [error, setError] = useState("");
  const [invoiceWarning, setInvoiceWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setForm({
      warehouseId: lot.warehouse.id,
      vendorId: lot.vendor?.id ?? "",
      purchaseInvoiceNo: lot.purchaseInvoiceNo ?? "",
      purchaseDate: formatDateInput(lot.purchaseDate),
      expectedMinDate: lot.expectedMinDate ? formatDateInput(lot.expectedMinDate) : "",
      expectedMaxDate: lot.expectedMaxDate ? formatDateInput(lot.expectedMaxDate) : "",
      productId: lot.product.id,
      quantity: String(lot.quantity),
      unitPurchaseRate: String(lot.unitPurchaseRate),
      transportCharges: String(lot.transportCharges),
      commissionCharges: String(lot.commissionCharges),
    });
    setError("");
    setInvoiceWarning("");
  }, [lot]);

  async function checkPurchaseInvoiceDuplicate(invoiceNo: string) {
    if (!invoiceNo.trim()) {
      setInvoiceWarning("");
      return;
    }

    const params = new URLSearchParams({
      purchaseInvoiceNo: invoiceNo.trim(),
      excludeLotId: lot.id,
    });
    const response = await fetch(`/api/inventory/incoming/check?${params.toString()}`);
    if (!response.ok) return;

    const data = await parseApiJson<{
      duplicateInvoice: { lotNumber: string; purchaseInvoiceNo: string } | null;
    }>(response);
    if (data.duplicateInvoice) {
      setInvoiceWarning(
        `Invoice ${data.duplicateInvoice.purchaseInvoiceNo} is already used by lot ${data.duplicateInvoice.lotNumber}.`,
      );
      return;
    }

    setInvoiceWarning("");
  }

  async function submitUpdate(payload: Record<string, unknown>, confirmSimilar = false) {
    const response = await fetch(`/api/inventory/incoming/${lot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirmSimilar }),
    });

    const data = await parseApiJson<IncomingApiResponse>(response);
    return { response, data };
  }

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.displayName })),
    [products],
  );

  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.vendorName })),
    [vendors],
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [products, form.productId],
  );

  const totalPurchaseCost = useMemo(() => {
    const quantity = evaluateCellInput(form.quantity).value;
    const unitPurchaseRate = evaluateCellInput(form.unitPurchaseRate).value;
    if (quantity === null || quantity <= 0 || unitPurchaseRate === null) {
      return 0;
    }

    return calculateTotalPurchaseCost({
      quantity,
      unitPurchaseRate,
      gstRate: selectedProduct?.gstRate ?? lot.product.gstRate,
      transportCharges: evaluateCellInput(form.transportCharges).value ?? 0,
      commissionCharges: evaluateCellInput(form.commissionCharges).value ?? 0,
    });
  }, [
    form.quantity,
    form.unitPurchaseRate,
    form.transportCharges,
    form.commissionCharges,
    selectedProduct?.gstRate,
    lot.product.gstRate,
  ]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (!form.purchaseInvoiceNo.trim()) {
      setLoading(false);
      setError("Purchase invoice number is required.");
      return;
    }

    if (invoiceWarning) {
      setLoading(false);
      setError("Use a unique purchase invoice number before saving.");
      return;
    }

    if (!form.productId || !products.some((product) => product.id === form.productId)) {
      setLoading(false);
      setError("Select a valid product from the list.");
      return;
    }

    if (form.vendorId && !vendors.some((vendor) => vendor.id === form.vendorId)) {
      setLoading(false);
      setError("Select a valid vendor from the list.");
      return;
    }

    const quantityResult = resolveFormulaField(form.quantity, "Expected quantity");
    const unitRateResult = resolveFormulaField(form.unitPurchaseRate, "Per unit purchase rate");
    const transportResult = resolveFormulaField(
      form.transportCharges.trim() ? form.transportCharges : "0",
      "Transport charges",
    );
    const commissionResult = resolveFormulaField(
      form.commissionCharges.trim() ? form.commissionCharges : "0",
      "Commission charges",
    );

    const fieldError =
      quantityResult.error ??
      unitRateResult.error ??
      transportResult.error ??
      commissionResult.error;

    if (fieldError) {
      setLoading(false);
      setError(fieldError);
      return;
    }

    if ((quantityResult.value ?? 0) <= 0) {
      setLoading(false);
      setError("Expected quantity must be greater than zero.");
      return;
    }

    const payload = {
      warehouseId: form.warehouseId,
      vendorId: form.vendorId || undefined,
      purchaseInvoiceNo: form.purchaseInvoiceNo.trim(),
      purchaseDate: form.purchaseDate,
      expectedMinDate: form.expectedMinDate || undefined,
      expectedMaxDate: form.expectedMaxDate || undefined,
      productId: form.productId,
      quantity: quantityResult.value,
      unitPurchaseRate: unitRateResult.value,
      transportCharges: transportResult.value ?? 0,
      commissionCharges: commissionResult.value ?? 0,
    };

    let { response, data } = await submitUpdate(payload);

    if (
      !response.ok &&
      data.code === "SIMILAR_ENTRY_EXISTS" &&
      data.details?.matches?.length
    ) {
      const confirmed = window.confirm(
        `Similar incoming purchase record(s) already exist:\n${formatSimilarMatches(data.details.matches)}\n\nSave anyway?`,
      );
      if (confirmed) {
        ({ response, data } = await submitUpdate(payload, true));
      } else {
        setLoading(false);
        return;
      }
    }

    setLoading(false);

    if (!response.ok) {
      if (data.code === "DUPLICATE_PURCHASE_INVOICE") {
        setInvoiceWarning(data.message ?? "This purchase invoice number already exists.");
      }
      setError(data.message ?? "Failed to update incoming lot.");
      return;
    }

    if (onSaved) {
      await onSaved();
    }
    onClose();
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete lot ${lot.lotNumber}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const response = await fetch(`/api/inventory/incoming/${lot.id}`, {
      method: "DELETE",
    });
    const data = await parseApiJson<{ message?: string }>(response);
    setDeleting(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to delete incoming lot.");
      return;
    }

    if (onDeleted) {
      await onDeleted();
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} size="xl">
      <ModalHeader title="Edit Incoming Lot" description={lot.lotNumber} onClose={onClose} />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={`${lot.company.name} (${lot.company.code})`} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Incoming Warehouse</Label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                required
              >
                {companyWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <TypeaheadSelect
              label="Product"
              options={productOptions}
              value={form.productId}
              onChange={(productId) => setForm({ ...form, productId })}
              placeholder="Type product name here"
              required
            />
            <TypeaheadSelect
              label="Vendor"
              options={vendorOptions}
              value={form.vendorId}
              onChange={(vendorId) => setForm({ ...form, vendorId })}
              placeholder="Type vendor name..."
              allowEmpty
              emptyLabel="No vendor"
            />
            <div className="space-y-2">
              <Label>Purchase invoice no.</Label>
              <Input
                value={form.purchaseInvoiceNo}
                onChange={(e) => {
                  setForm({ ...form, purchaseInvoiceNo: e.target.value });
                  setInvoiceWarning("");
                }}
                onBlur={(e) => checkPurchaseInvoiceDuplicate(e.target.value)}
                required
              />
              {invoiceWarning ? (
                <p className="text-sm text-amber-700">{invoiceWarning}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Purchase date</Label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Expected arrival from</Label>
              <Input type="date" value={form.expectedMinDate} onChange={(e) => setForm({ ...form, expectedMinDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Expected arrival by</Label>
              <Input type="date" min={form.expectedMinDate || undefined} value={form.expectedMaxDate} onChange={(e) => setForm({ ...form, expectedMaxDate: e.target.value })} />
            </div>
            <FormulaInput
              label="Expected quantity"
              value={form.quantity}
              onChange={(quantity) => setForm({ ...form, quantity })}
              placeholder="100 or =20*33"
              required
            />
            <FormulaInput
              label="Per unit purchase rate"
              value={form.unitPurchaseRate}
              onChange={(unitPurchaseRate) => setForm({ ...form, unitPurchaseRate })}
              placeholder="8500 or =100*85"
              required
            />
            <FormulaInput
              label="Transport charges"
              value={form.transportCharges}
              onChange={(transportCharges) => setForm({ ...form, transportCharges })}
              placeholder="0 or =500+250"
            />
            <FormulaInput
              label="Commission charges"
              value={form.commissionCharges}
              onChange={(commissionCharges) => setForm({ ...form, commissionCharges })}
              placeholder="0 or =100*10"
            />
            <div className="space-y-2 md:col-span-2">
              <Label>Total purchase cost</Label>
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
                {totalPurchaseCost.toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="submit" disabled={loading || deleting}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
          {allowDelete ? (
            <Button
              type="button"
              variant="outline"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={loading || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete lot"}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}

function isEditableIncomingLot(lot: SerializedInventoryLot) {
  return lot.status === "INCOMING" && lot.receivedQuantity === 0 && lot.damagedQuantity === 0;
}

export { isEditableIncomingLot };
