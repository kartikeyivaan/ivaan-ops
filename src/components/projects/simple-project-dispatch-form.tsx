"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import {
  MAX_SERIALS_PER_ENTRY,
  parseSerialInput,
  serialsPerEntryLimitMessage,
} from "@/lib/inventory";
import { parseApiJson } from "@/lib/api-response";
import { SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD } from "@/lib/simple-project-dispatch";

type ProjectRef = {
  id: string;
  projectNo: string;
  customerName: string;
  status: string;
};

type AcceptedSerial = {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  warehouseName: string | null;
};

type InvalidSerial = { serialNumber: string; reason: string };

type ProductGroup = {
  productId: string;
  productName: string;
  qty: number;
  serials: AcceptedSerial[];
};

export function SimpleProjectDispatchForm() {
  const router = useRouter();
  const [projectNoQuery, setProjectNoQuery] = useState("");
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newProjectNo, setNewProjectNo] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [serials, setSerials] = useState<AcceptedSerial[]>([]);
  const [invalidSerials, setInvalidSerials] = useState<InvalidSerial[]>([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState<string[]>([]);
  const [receiverName, setReceiverName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const serialsRef = useRef(serials);
  serialsRef.current = serials;

  const groups = useMemo(() => {
    const map = new Map<string, ProductGroup>();
    for (const serial of serials) {
      const existing = map.get(serial.productId);
      if (existing) {
        existing.qty += 1;
        existing.serials.push(serial);
      } else {
        map.set(serial.productId, {
          productId: serial.productId,
          productName: serial.productName,
          qty: 1,
          serials: [serial],
        });
      }
    }
    return [...map.values()];
  }, [serials]);

  const heading = project
    ? `Projects Dispatch - ${project.projectNo} - ${project.customerName}`
    : "Projects Dispatch";

  async function lookupProject() {
    setError("");
    setLookupMessage("");
    setShowCreate(false);
    const projectNo = projectNoQuery.trim();
    if (!projectNo) {
      setError("Enter a project number.");
      return;
    }
    const response = await fetch(
      `/api/projects/minimal?projectNo=${encodeURIComponent(projectNo)}`,
    );
    const data = await parseApiJson(response);
    if (response.status === 404) {
      setProject(null);
      setShowCreate(true);
      setNewProjectNo(projectNo);
      setLookupMessage("Project not found. Create it below.");
      return;
    }
    if (!response.ok) {
      setError(data.message ?? "Unable to find project.");
      return;
    }
    setProject(data as ProjectRef);
    setLookupMessage(`Matched ${data.projectNo} — ${data.customerName}`);
  }

  async function createProject() {
    setError("");
    setLoading(true);
    const response = await fetch("/api/projects/minimal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectNo: newProjectNo.trim() || projectNoQuery.trim(),
        customerName: newCustomerName.trim(),
      }),
    });
    const data = await parseApiJson(response);
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to create project.");
      return;
    }
    setProject(data as ProjectRef);
    setShowCreate(false);
    setLookupMessage(`Created ${data.projectNo} — ${data.customerName}`);
  }

  async function validateSerials(rawNumbers: string[]): Promise<{
    acceptedCount: number;
    firstInvalidReason?: string;
  }> {
    if (!project) {
      setError("Select or create a project first.");
      return { acceptedCount: 0, firstInvalidReason: "Select or create a project first." };
    }
    const existing = new Set(serialsRef.current.map((row) => row.serialNumber));
    const incoming = rawNumbers.filter((value) => value && !existing.has(value));
    if (incoming.length === 0) {
      return { acceptedCount: 0, firstInvalidReason: "Serial already added or empty." };
    }

    if (serialsRef.current.length + incoming.length > MAX_SERIALS_PER_ENTRY) {
      const message = serialsPerEntryLimitMessage(serialsRef.current.length + incoming.length);
      setError(message);
      return { acceptedCount: 0, firstInvalidReason: message };
    }

    setLookingUp(true);
    setError("");
    const response = await fetch("/api/simple-project-dispatches/lookup-serials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, serialNumbers: incoming }),
    });
    const data = await parseApiJson(response);
    setLookingUp(false);
    if (!response.ok) {
      const message = data.message ?? "Unable to validate serials.";
      setError(message);
      return { acceptedCount: 0, firstInvalidReason: message };
    }

    const accepted: AcceptedSerial[] = (data.valid ?? []).map(
      (row: {
        id: string;
        serialNumber: string;
        product: { id: string; displayName: string };
        warehouse: { name: string } | null;
      }) => ({
        id: row.id,
        serialNumber: row.serialNumber,
        productId: row.product.id,
        productName: row.product.displayName,
        warehouseName: row.warehouse?.name ?? null,
      }),
    );

    setSerials((current) => {
      const seen = new Set(current.map((row) => row.id));
      const next = [...current, ...accepted.filter((row) => !seen.has(row.id))];
      serialsRef.current = next;
      return next;
    });
    setInvalidSerials(data.invalid ?? []);
    setDuplicatesRemoved(data.duplicatesRemoved ?? []);
    setPasteText("");
    return {
      acceptedCount: accepted.length,
      firstInvalidReason: data.invalid?.[0]?.reason,
    };
  }

  async function handlePasteValidate() {
    await validateSerials(parseSerialInput(pasteText));
  }

  async function handleScanResults(serialNumbers: string[]): Promise<SerialScanResult> {
    if (!project) {
      return { ok: false, reason: "Select or create a project first." };
    }
    const result = await validateSerials(serialNumbers);
    if (result.acceptedCount > 0) {
      return { ok: true, message: "Serial added." };
    }
    return {
      ok: false,
      reason: result.firstInvalidReason ?? "Serial not accepted.",
    };
  }

  function removeSerial(serialId: string) {
    setSerials((current) => current.filter((row) => row.id !== serialId));
  }

  async function saveDraftAndMaybeConfirm(action: "save" | "submit" | "confirm") {
    if (!project) {
      setError("Select or create a project first.");
      return;
    }
    if (serials.length === 0) {
      setError("Add at least one valid serial number.");
      return;
    }
    if ((action === "confirm" || action === "submit") && !receiverName.trim()) {
      setError("Receiver name is required.");
      return;
    }

    setLoading(true);
    setError("");

    const payload = {
      projectId: project.id,
      receiverName: receiverName.trim(),
      remarks: remarks.trim() || undefined,
      serials: serials.map((row) => ({ serialId: row.id, productId: row.productId })),
    };

    const createResponse = await fetch("/api/simple-project-dispatches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const created = await parseApiJson(createResponse);
    if (!createResponse.ok) {
      setLoading(false);
      setError(created.message ?? "Unable to save draft.");
      return;
    }

    if (action === "save") {
      setLoading(false);
      router.push(`/projects/dispatch/${created.id}`);
      return;
    }

    if (action === "submit") {
      const submitResponse = await fetch(
        `/api/simple-project-dispatches/${created.id}/submit-approval`,
        { method: "POST" },
      );
      const submitted = await parseApiJson(submitResponse);
      setLoading(false);
      if (!submitResponse.ok) {
        setError(submitted.message ?? "Unable to submit for approval.");
        router.push(`/projects/dispatch/${created.id}`);
        return;
      }
      router.push(`/projects/dispatch/${created.id}`);
      return;
    }

    const confirmResponse = await fetch(
      `/api/simple-project-dispatches/${created.id}/confirm`,
      { method: "POST" },
    );
    const confirmed = await parseApiJson(confirmResponse);
    setLoading(false);
    if (!confirmResponse.ok) {
      setError(confirmed.message ?? "Unable to confirm dispatch.");
      router.push(`/projects/dispatch/${created.id}`);
      return;
    }
    router.push(`/projects/dispatch/${created.id}`);
  }

  const isLarge = serials.length > SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Simple Project Dispatch
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
          <p className="text-sm text-slate-500">
            Paste or scan serials from any warehouse. Confirm removes them from inventory via
            Projects WH.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/projects/dispatch">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Project Number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="projectNo">Project Number (from physical register)</Label>
              <Input
                id="projectNo"
                value={projectNoQuery}
                onChange={(event) => setProjectNoQuery(event.target.value)}
                placeholder="e.g. ISE-PRJ-26-27-00012"
              />
            </div>
            <Button type="button" onClick={lookupProject}>
              Match
            </Button>
          </div>
          {lookupMessage ? <p className="text-sm text-slate-600">{lookupMessage}</p> : null}
          {showCreate ? (
            <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
              <p className="text-sm font-medium text-slate-800">Create project</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newProjectNo">Project Number</Label>
                  <Input
                    id="newProjectNo"
                    value={newProjectNo}
                    onChange={(event) => setNewProjectNo(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newCustomerName">Customer Name</Label>
                  <Input
                    id="newCustomerName"
                    value={newCustomerName}
                    onChange={(event) => setNewCustomerName(event.target.value)}
                  />
                </div>
              </div>
              <Button type="button" onClick={createProject} disabled={loading}>
                <Plus className="h-4 w-4" />
                Create project
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Paste / Scan Serial Numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={5}
            disabled={!project}
            placeholder="Paste serial numbers (one per line or comma-separated)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePasteValidate}
              disabled={!project || lookingUp || !pasteText.trim()}
            >
              {lookingUp ? "Validating…" : "Validate"}
            </Button>
            <ScanSerialsButton
              onClick={() => setScannerOpen(true)}
              disabled={!project}
            />
          </div>
          {duplicatesRemoved.length > 0 ? (
            <p className="text-sm text-amber-700">
              Removed {duplicatesRemoved.length} duplicate serial
              {duplicatesRemoved.length === 1 ? "" : "s"} automatically.
            </p>
          ) : null}
          {invalidSerials.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Blocked serials</p>
              <ul className="mt-1 list-disc pl-5">
                {invalidSerials.map((row) => (
                  <li key={`${row.serialNumber}-${row.reason}`}>
                    {row.serialNumber}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Validate view</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">No accepted serials yet.</p>
          ) : (
            groups.map((group) => (
              <div key={group.productId} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    {group.productName} — {group.qty} Qty
                  </p>
                </div>
                <ul className="space-y-1">
                  {group.serials.map((serial) => (
                    <li
                      key={serial.id}
                      className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm"
                    >
                      <span>
                        {serial.serialNumber}
                        {serial.warehouseName ? (
                          <span className="text-slate-500"> · {serial.warehouseName}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="text-slate-500 hover:text-red-600"
                        onClick={() => removeSerial(serial.id)}
                        aria-label={`Remove ${serial.serialNumber}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="text-sm text-slate-600">Total serials: {serials.length}</p>
          {isLarge ? (
            <p className="text-sm text-amber-800">
              More than {SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD} serials — Warehouse can submit
              for approval; Projects Manager / Super Admin confirms.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Receiver</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receiverName">Receiver Name</Label>
            <Input
              id="receiverName"
              value={receiverName}
              onChange={(event) => setReceiverName(event.target.value)}
              placeholder="Site receiver name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks (optional)</Label>
            <Input
              id="remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading || !project || serials.length === 0}
              onClick={() => saveDraftAndMaybeConfirm("save")}
            >
              Save draft
            </Button>
            {isLarge ? (
              <Button
                type="button"
                disabled={loading || !project || serials.length === 0}
                onClick={() => saveDraftAndMaybeConfirm("submit")}
              >
                Submit for approval
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={loading || !project || serials.length === 0}
              onClick={() => saveDraftAndMaybeConfirm("confirm")}
            >
              {isLarge ? "Approve & confirm (PM/SA)" : "Confirm dispatch (PM/SA)"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Warehouse can prepare and submit. Only Projects Manager / Super Admin can confirm.
          </p>
        </CardContent>
      </Card>

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResults}
        title="Scan project dispatch serials"
      />
    </div>
  );
}
