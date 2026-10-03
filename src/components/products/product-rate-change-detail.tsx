"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import type { ProductRateChangeBatchDto } from "@/lib/product-rate-change-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type ProductOption = {
  id: string;
  displayName: string;
  currentStandardPrice: number | null;
  currentMinimumPrice: number | null;
};

type EditableLine = {
  key: string;
  productId: string;
  productName: string;
  standardPrice: string;
  minimumPrice: string;
};

function toEditableLines(batch: ProductRateChangeBatchDto): EditableLine[] {
  return batch.lines.map((line) => ({
    key: line.id,
    productId: line.productId,
    productName: line.productName,
    standardPrice: String(line.newStandardPrice),
    minimumPrice: String(line.newMinimumPrice),
  }));
}

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function ProductRateChangeDetail({
  initialBatch,
  canEdit,
  canApprove,
  currentUserId,
}: {
  initialBatch: ProductRateChangeBatchDto;
  canEdit: boolean;
  canApprove: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [batch, setBatch] = useState(initialBatch);
  const [lines, setLines] = useState<EditableLine[]>(() => toEditableLines(initialBatch));
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const editable = canEdit && (batch.status === "DRAFT" || batch.status === "REJECTED");
  const showApprovalTable =
    batch.status === "PENDING" || batch.status === "APPROVED" || batch.status === "REJECTED";
  const userSignedOff = batch.signOffs.some((row) => row.userId === currentUserId);
  const canActAsApprover = canApprove && batch.status === "PENDING" && !userSignedOff;

  useEffect(() => {
    setBatch(initialBatch);
    setLines(toEditableLines(initialBatch));
  }, [initialBatch]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products?isActive=true")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setProducts(
          data.map(
            (row: {
              id: string;
              displayName: string;
              currentPrice?: { standardPrice: number; minimumPrice: number } | null;
            }) => ({
              id: row.id,
              displayName: row.displayName,
              currentStandardPrice: row.currentPrice?.standardPrice ?? null,
              currentMinimumPrice: row.currentPrice?.minimumPrice ?? null,
            }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.displayName.toLowerCase().includes(q)).slice(0, 20);
  }, [productSearch, products]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        productId: "",
        productName: "",
        standardPrice: "",
        minimumPrice: "",
      },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    updateLine(key, {
      productId: product.id,
      productName: product.displayName,
      standardPrice:
        product.currentStandardPrice != null ? String(product.currentStandardPrice) : "",
      minimumPrice:
        product.currentMinimumPrice != null ? String(product.currentMinimumPrice) : "",
    });
    setProductSearch("");
  }

  function buildPayload() {
    return {
      lines: lines.map((line) => ({
        productId: line.productId,
        standardPrice: Number(line.standardPrice),
        minimumPrice: Number(line.minimumPrice),
      })),
    };
  }

  async function saveDraft() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/product-rate-changes/${batch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const data = await parseApiJson<ProductRateChangeBatchDto & { message?: string }>(response);
    setLoading(false);
    if (!response.ok) {
      setMessage(data.message ?? "Unable to save.");
      return;
    }
    setBatch(data);
    setLines(toEditableLines(data));
    setMessage("Saved.");
    router.refresh();
  }

  async function submitBatch() {
    setLoading(true);
    setMessage(null);
    const saveResponse = await fetch(`/api/product-rate-changes/${batch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const saveData = await parseApiJson<{ message?: string }>(saveResponse);
    if (!saveResponse.ok) {
      setLoading(false);
      setMessage(saveData.message ?? "Unable to save before submit.");
      return;
    }

    const response = await fetch(`/api/product-rate-changes/${batch.id}/submit`, {
      method: "POST",
    });
    const data = await parseApiJson<ProductRateChangeBatchDto & { message?: string }>(response);
    setLoading(false);
    if (!response.ok) {
      setMessage(data.message ?? "Unable to submit.");
      return;
    }
    setBatch(data);
    setLines(toEditableLines(data));
    router.refresh();
  }

  async function approveBatch() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/product-rate-changes/${batch.id}/approve`, {
      method: "POST",
    });
    const data = await parseApiJson<ProductRateChangeBatchDto & { message?: string }>(response);
    setLoading(false);
    if (!response.ok) {
      setMessage(data.message ?? "Unable to approve.");
      return;
    }
    setBatch(data);
    router.refresh();
  }

  async function rejectBatch() {
    if (!rejectReason.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/product-rate-changes/${batch.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    const data = await parseApiJson<ProductRateChangeBatchDto & { message?: string }>(response);
    setLoading(false);
    if (!response.ok) {
      setMessage(data.message ?? "Unable to reject.");
      return;
    }
    setBatch(data);
    setRejectOpen(false);
    setRejectReason("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/masters/products/rate-changes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Rate changes
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{batch.requestNumber}</h1>
          <p className="text-sm text-slate-600">
            Created by {batch.createdByName} · {formatDate(batch.createdAt)}
          </p>
        </div>
        <Badge>{batch.status}</Badge>
      </div>

      {batch.status === "PENDING" ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-700">
            Approvals: {batch.approvalCount}/{batch.requiredApprovals}
            {batch.signOffs.length > 0 ? (
              <span className="text-slate-500">
                {" "}
                — {batch.signOffs.map((row) => row.userName).join(", ")}
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {batch.status === "REJECTED" && batch.rejectionReason ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-800">
            Rejected by {batch.rejectedByName ?? "approver"}: {batch.rejectionReason}
          </CardContent>
        </Card>
      ) : null}

      {showApprovalTable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposed changes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Old standard</TableHead>
                  <TableHead>New standard</TableHead>
                  <TableHead>Old minimum</TableHead>
                  <TableHead>New minimum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.productName}</TableCell>
                    <TableCell>{formatInr(line.previousStandardPrice)}</TableCell>
                    <TableCell>{formatInr(line.newStandardPrice)}</TableCell>
                    <TableCell>{formatInr(line.previousMinimumPrice)}</TableCell>
                    <TableCell>{formatInr(line.newMinimumPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {editable ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Edit lines</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-12"
              >
                <div className="space-y-2 md:col-span-5">
                  <Label>Product</Label>
                  <Input
                    list={`products-${line.key}`}
                    value={line.productName || productSearch}
                    placeholder="Search product…"
                    onChange={(e) => {
                      const value = e.target.value;
                      setProductSearch(value);
                      updateLine(line.key, { productName: value, productId: "" });
                    }}
                    onBlur={() => {
                      const match = products.find(
                        (p) => p.displayName.toLowerCase() === line.productName.trim().toLowerCase(),
                      );
                      if (match) selectProduct(line.key, match.id);
                    }}
                  />
                  <datalist id={`products-${line.key}`}>
                    {filteredProducts.map((product) => (
                      <option key={product.id} value={product.displayName} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Standard price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.standardPrice}
                    onChange={(e) => updateLine(line.key, { standardPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Minimum price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.minimumPrice}
                    onChange={(e) => updateLine(line.key, { minimumPrice: e.target.value })}
                  />
                </div>
                <div className="flex items-end md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.key)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4 text-slate-500" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={loading} onClick={saveDraft}>
                Save draft
              </Button>
              <Button type="button" disabled={loading} onClick={submitBatch}>
                Submit for approval
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canActAsApprover ? (
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            <Button disabled={loading} onClick={approveBatch}>
              Approve
            </Button>
            <Button disabled={loading} variant="outline" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {rejectOpen ? (
        <Modal onClose={() => setRejectOpen(false)} size="sm">
          <ModalHeader title="Reject rate change" />
          <ModalBody>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason</Label>
              <Input
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={loading} onClick={rejectBatch}>
              Reject batch
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
