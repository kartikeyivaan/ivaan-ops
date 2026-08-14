"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatProjectDispatchStatus,
  formatProjectLineSource,
  formatProjectLineStatus,
  formatProjectStatus,
} from "@/lib/projects";
import type {
  LinkedPurchaseRequest,
  SerializedProject,
  SerializedProjectMaterialLine,
} from "@/lib/project-service";
import { ProjectCloseDialog } from "@/components/projects/project-close-dialog";

type ProductOption = {
  id: string;
  displayName: string;
};

function clientLineNeedsApproval(line: SerializedProjectMaterialLine): boolean {
  if (line.source === "ADDED" && line.lastApprovedQty == null) return true;
  if (line.lastApprovedQty == null) return line.lineStatus === "DRAFT";
  return line.requiredQty !== line.lastApprovedQty;
}

function lineStatusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ASSIGNED" || status === "FULLY_DISPATCHED") return "success";
  if (status === "PENDING_STOCK" || status === "PENDING_APPROVAL" || status === "PARTIALLY_DISPATCHED") {
    return "warning";
  }
  return "default";
}

type LineDraft = {
  productId: string;
  qty: string;
};

function emptyLine(): LineDraft {
  return { productId: "", qty: "" };
}

function lineSourceVariant(source: string): "default" | "success" | "warning" {
  if (source === "ADDED") return "warning";
  return "default";
}

export function ProjectMaterialForm({
  project,
  products,
  canEdit,
  canReturnStock,
  onUpdated,
}: {
  project: SerializedProject;
  products: ProductOption[];
  canEdit: boolean;
  canReturnStock: boolean;
  onUpdated: (project: SerializedProject) => void;
}) {
  const [lines, setLines] = useState(project.assignment?.lines ?? []);
  const [newLine, setNewLine] = useState<LineDraft>(emptyLine());
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function returnLineStock(line: SerializedProjectMaterialLine) {
    const qty = window.prompt(`Return quantity (max ${line.balanceQty}):`, String(line.balanceQty));
    if (!qty) return;
    const parsedQty = Number(qty);
    if (!parsedQty || parsedQty <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    setLoading(`return-${line.id}`);
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/return-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: line.id, qty: parsedQty }),
    });
    setLoading(null);
    await refreshFromResponse(response);
  }

  const readOnly = !canEdit || project.status === "CLOSED" || project.status === "MATERIAL_PENDING_APPROVAL";

  async function refreshFromResponse(response: Response) {
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "Unable to save changes.");
      return false;
    }
    setLines(data.assignment?.lines ?? []);
    onUpdated(data);
    setError(null);
    return true;
  }

  async function addRow() {
    const qty = Number(newLine.qty);
    if (!newLine.productId || !qty || qty <= 0) {
      setError("Select a product and enter a quantity greater than zero.");
      return;
    }

    setLoading("add");
    const response = await fetch(`/api/projects/${project.id}/material-assignment/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: newLine.productId, requiredQty: qty }),
    });
    setLoading(null);
    if (await refreshFromResponse(response)) {
      setNewLine(emptyLine());
    }
  }

  async function saveLineQty(lineId: string, requiredQty: number) {
    if (requiredQty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    setLoading(lineId);
    const response = await fetch(
      `/api/projects/${project.id}/material-assignment/lines/${lineId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredQty }),
      },
    );
    setLoading(null);
    await refreshFromResponse(response);
  }

  async function removeLine(lineId: string) {
    if (!window.confirm("Remove this added line?")) return;
    setLoading(lineId);
    const response = await fetch(
      `/api/projects/${project.id}/material-assignment/lines/${lineId}`,
      { method: "DELETE" },
    );
    setLoading(null);
    await refreshFromResponse(response);
  }

  const productOptions = products.map((product) => ({
    value: product.id,
    label: product.displayName,
  }));

  const materialColCount =
    7 +
    (canReturnStock && project.status !== "CLOSED" ? 1 : 0) +
    (!readOnly ? 1 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Material Assignment</CardTitle>
        <p className="text-sm text-slate-500">
          Default lines from the approved proposal. Add rows for extra material as needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                {canReturnStock && project.status !== "CLOSED" ? (
                  <TableHead className="w-28">Return</TableHead>
                ) : null}
                {!readOnly ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={materialColCount} className="py-6 text-center text-slate-500">
                    No material lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.productName}</TableCell>
                    <TableCell>
                      <Badge variant={lineSourceVariant(line.source)}>
                        {formatProjectLineSource(line.source)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {readOnly ? (
                        line.requiredQty
                      ) : (
                        <Input
                          type="number"
                          min={line.dispatchedQty || 1}
                          step="1"
                          className="ml-auto w-24 text-right"
                          defaultValue={line.requiredQty}
                          disabled={loading === line.id}
                          onBlur={(event) => {
                            const next = Number(event.target.value);
                            if (next !== line.requiredQty) {
                              void saveLineQty(line.id, next);
                            }
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">{line.assignedQty}</TableCell>
                    <TableCell className="text-right">{line.dispatchedQty}</TableCell>
                    <TableCell className="text-right">{line.balanceQty}</TableCell>
                    <TableCell>
                      <Badge variant={lineStatusVariant(line.lineStatus)}>
                        {formatProjectLineStatus(line.lineStatus)}
                      </Badge>
                      {line.purchaseRequestNumber ? (
                        <p className="mt-1 text-xs text-slate-500">
                          PR: {line.purchaseRequestNumber}
                        </p>
                      ) : null}
                    </TableCell>
                    {canReturnStock && project.status !== "CLOSED" ? (
                      <TableCell>
                        {line.balanceQty > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loading === `return-${line.id}`}
                            onClick={() => void returnLineStock(line)}
                          >
                            Return to HO
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    ) : null}
                    {!readOnly ? (
                      <TableCell>
                        {line.source === "ADDED" && line.dispatchedQty === 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={loading === line.id}
                            onClick={() => void removeLine(line.id)}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!readOnly ? (
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-slate-200 p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <TypeaheadSelect
                label="Product"
                options={productOptions}
                value={newLine.productId}
                onChange={(value) => setNewLine((prev) => ({ ...prev, productId: value }))}
                placeholder="Search product…"
              />
            </div>
            <div className="w-full space-y-2 sm:w-32">
              <label className="text-sm font-medium text-slate-700">Qty</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={newLine.qty}
                onChange={(event) => setNewLine((prev) => ({ ...prev, qty: event.target.value }))}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={loading === "add"}
              onClick={() => void addRow()}
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>
        ) : null}

        {canEdit && project.status !== "CLOSED" ? (
          <MaterialApprovalActions project={project} onUpdated={onUpdated} lines={lines} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function MaterialApprovalActions({
  project,
  lines,
  onUpdated,
}: {
  project: SerializedProject;
  lines: SerializedProjectMaterialLine[];
  onUpdated: (project: SerializedProject) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasDelta = useMemo(() => lines.some(clientLineNeedsApproval), [lines]);
  const isPending = project.status === "MATERIAL_PENDING_APPROVAL";

  async function submitForApproval() {
    setLoading("submit");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/material-assignment/submit`, {
      method: "POST",
    });
    const data = await response.json();
    setLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to submit for approval.");
      return;
    }
    onUpdated(data);
  }

  async function approveMaterial() {
    setLoading("approve");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/material-assignment/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve material.");
      return;
    }
    onUpdated(data);
  }

  async function rejectMaterial() {
    const reason = window.prompt("Rejection reason:");
    if (!reason?.trim()) return;
    setLoading("reject");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/material-assignment/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    setLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject material.");
      return;
    }
    onUpdated(data);
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isPending ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Material assignment is pending Projects Manager approval.{" "}
          <Link href="/approvals" className="font-medium underline">
            Open approvals
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!isPending && hasDelta ? (
          <Button
            type="button"
            disabled={loading != null}
            onClick={() => void submitForApproval()}
          >
            {loading === "submit" ? "Submitting…" : "Submit for Material Approval"}
          </Button>
        ) : null}

        {isPending ? (
          <>
            <Button
              type="button"
              disabled={loading != null}
              onClick={() => void approveMaterial()}
            >
              {loading === "approve" ? "Approving…" : "Approve Material"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading != null}
              onClick={() => void rejectMaterial()}
            >
              Reject
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectDetailView({
  project: initialProject,
  products,
  canEdit,
  canClose,
  canReturnStock,
  dispatches = [],
  linkedPurchaseRequests = [],
}: {
  project: SerializedProject;
  products: ProductOption[];
  canEdit: boolean;
  canClose: boolean;
  canReturnStock: boolean;
  dispatches?: Array<{
    id: string;
    dispatchNo: string;
    status: string;
    dispatchedAt: string | null;
    lines: Array<{ qty: number }>;
  }>;
  linkedPurchaseRequests?: LinkedPurchaseRequest[];
}) {
  const [project, setProject] = useState(initialProject);
  const [closeOpen, setCloseOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{project.projectNo}</h1>
          <p className="text-sm text-slate-500">
            Proposal {project.proposalNo} · {project.customerName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{formatProjectStatus(project.status)}</Badge>
          {canClose && project.status !== "CLOSED" ? (
            <Button type="button" variant="outline" onClick={() => setCloseOpen(true)}>
              Close Project
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Customer:</span> {project.customerName}
            </p>
            <p>
              <span className="text-slate-500">Mobile:</span> {project.customerMobile}
            </p>
            <p>
              <span className="text-slate-500">Site:</span> {project.siteAddress}
            </p>
            <p>
              <span className="text-slate-500">Staging warehouse:</span> {project.warehouseName}
            </p>
          </CardContent>
        </Card>
      </div>

      <ProjectMaterialForm
        project={project}
        products={products}
        canEdit={canEdit}
        canReturnStock={canReturnStock}
        onUpdated={setProject}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked Purchase Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedPurchaseRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No purchase requests linked to this project.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PR No</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Fulfilled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedPurchaseRequests.map((row) => (
                    <TableRow key={`${row.id}-${row.materialLineId}`}>
                      <TableCell className="font-medium">{row.requestNumber}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{row.requestedQty}</TableCell>
                      <TableCell className="text-right">{row.fulfilledQty}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/purchase/requests/${row.id}`}
                          className="text-sm font-medium text-emerald-700 hover:underline"
                        >
                          View PR
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatch History</CardTitle>
        </CardHeader>
        <CardContent>
          {dispatches.length === 0 ? (
            <p className="text-sm text-slate-500">No project dispatches yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan No</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches.map((dispatch) => (
                    <TableRow key={dispatch.id}>
                      <TableCell className="font-medium">{dispatch.dispatchNo}</TableCell>
                      <TableCell>{formatProjectDispatchStatus(dispatch.status)}</TableCell>
                      <TableCell className="text-right">{dispatch.lines.length}</TableCell>
                      <TableCell>
                        {dispatch.dispatchedAt
                          ? new Date(dispatch.dispatchedAt).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/inventory/dispatches/projects/${dispatch.id}`}
                          className="text-sm font-medium text-emerald-700 hover:underline"
                        >
                          View
                        </Link>
                        {dispatch.status === "DISPATCHED" ? (
                          <>
                            {" · "}
                            <a
                              href={`/api/project-dispatches/${dispatch.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-emerald-700 hover:underline"
                            >
                              PDF
                            </a>
                          </>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {project.status !== "CLOSED" ? (
            <div className="mt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/inventory/dispatches/projects/new?projectId=${project.id}`}>
                  Create Project Dispatch
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProjectCloseDialog
        projectId={project.id}
        projectNo={project.projectNo}
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onClosed={setProject}
      />
    </div>
  );
}
