"use client";

import { useEffect, useMemo, useState } from "react";
import { parseApiJson } from "@/lib/api-response";
import type { SerializedInventoryLot } from "@/lib/inventory-service";
import type { SerializedIncomingLotChangeRequest } from "@/lib/incoming-lot-change-service";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { FormulaInput, resolveFormulaField } from "@/components/ui/formula-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";

type Product = { id: string; displayName: string; gstRate: number };

type ReceiveEditResponse = {
  mode?: "APPLIED" | "PENDING_APPROVAL";
  message?: string;
  code?: string;
  lot?: SerializedInventoryLot | null;
  changeRequest?: SerializedIncomingLotChangeRequest | null;
};

export function IncomingLotReceiveEditDialog({
  lot,
  products,
  requiresApproval,
  onClose,
  onApplied,
  onSubmittedForApproval,
}: {
  lot: SerializedInventoryLot;
  products: Product[];
  requiresApproval: boolean;
  onClose: () => void;
  onApplied: (lot: SerializedInventoryLot) => void | Promise<void>;
  onSubmittedForApproval: (
    changeRequest: SerializedIncomingLotChangeRequest,
  ) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    productId: lot.product.id,
    quantity: String(lot.quantity),
    purchaseInvoiceNo: lot.purchaseInvoiceNo ?? "",
  });
  const [error, setError] = useState("");
  const [invoiceWarning, setInvoiceWarning] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm({
      productId: lot.product.id,
      quantity: String(lot.quantity),
      purchaseInvoiceNo: lot.purchaseInvoiceNo ?? "",
    });
    setError("");
    setInvoiceWarning("");
  }, [lot]);

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.displayName })),
    [products],
  );

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

    const quantityResult = resolveFormulaField(form.quantity, "Expected quantity");
    if (quantityResult.error) {
      setLoading(false);
      setError(quantityResult.error);
      return;
    }
    if ((quantityResult.value ?? 0) <= 0) {
      setLoading(false);
      setError("Expected quantity must be greater than zero.");
      return;
    }

    const response = await fetch(`/api/inventory/incoming/${lot.id}/receive-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: form.productId,
        quantity: quantityResult.value,
        purchaseInvoiceNo: form.purchaseInvoiceNo.trim(),
      }),
    });

    const data = await parseApiJson<ReceiveEditResponse>(response);
    setLoading(false);

    if (!response.ok) {
      if (data.code === "DUPLICATE_PURCHASE_INVOICE") {
        setInvoiceWarning(data.message ?? "This purchase invoice number already exists.");
      }
      setError(data.message ?? "Failed to save lot changes.");
      return;
    }

    if (data.mode === "APPLIED" && data.lot) {
      await onApplied(data.lot);
      onClose();
      return;
    }

    if (data.mode === "PENDING_APPROVAL" && data.changeRequest) {
      await onSubmittedForApproval(data.changeRequest);
      onClose();
      return;
    }

    setError(data.message ?? "Unexpected response while saving changes.");
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Edit lot details"
        description={
          requiresApproval
            ? `${lot.lotNumber} · Changes will need Purchase approval`
            : lot.lotNumber
        }
        onClose={onClose}
      />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="grid gap-4">
          <TypeaheadSelect
            label="Product"
            options={productOptions}
            value={form.productId}
            onChange={(productId) => setForm({ ...form, productId })}
            placeholder="Type product name here"
            required
          />
          <FormulaInput
            label="Expected quantity"
            value={form.quantity}
            onChange={(quantity) => setForm({ ...form, quantity })}
            placeholder="100 or =20*33"
            required
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
          {requiresApproval ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Warehouse edits to product, quantity, or invoice are sent to Purchase for approval
              before the lot is updated.
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="submit" disabled={loading}>
            {loading
              ? "Saving..."
              : requiresApproval
                ? "Submit for approval"
                : "Save changes"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
