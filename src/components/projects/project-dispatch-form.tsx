"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/dispatches/signature-pad";
import {
  ScanSerialsButton,
  SerialScanner,
  type SerialScanResult,
} from "@/components/inventory/serial-scanner";
import {
  MAX_SERIALS_PER_ENTRY,
  normalizeSerialNumber,
  parseSerialInput,
  serialsPerEntryLimitMessage,
} from "@/lib/inventory";
import { normalizeMobileNumber } from "@/lib/phone";
import type { DispatchableProject } from "@/lib/project-dispatch-service";
import {
  describePartialDispatchLines,
  effectiveDispatchQty,
  formatPartialDispatchConfirmMessage,
  isPartialDispatch,
} from "@/lib/dispatches";

type SelectedSerial = { id: string; serialNumber: string };
type InvalidSerial = { serialNumber: string; reason: string };

type LineDraft = {
  materialLineId: string;
  productId: string;
  productName: string;
  serialTracking: boolean;
  remainingQty: number;
  qty: string;
  kitProductId?: string;
  kitProductName?: string;
  kitBomQty?: number;
  serials: SelectedSerial[];
  pasteText: string;
  invalidSerials: InvalidSerial[];
  lookingUp: boolean;
};

function parseSerialPaste(text: string): string[] {
  return parseSerialInput(text);
}

export function ProjectDispatchForm({ defaultProjectId }: { defaultProjectId?: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<DispatchableProject[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [vehicleNo, setVehicleNo] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerLineIndex, setScannerLineIndex] = useState<number | null>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const linesForProjectIdRef = useRef("");

  useEffect(() => {
    fetch("/api/project-dispatches/dispatchable")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
          setProjectId((current) => current || data[0]?.id || "");
        }
      });
  }, []);

  useEffect(() => {
    const project = projects.find((row) => row.id === projectId);
    if (!project) {
      if (linesForProjectIdRef.current) {
        setLines([]);
        linesForProjectIdRef.current = "";
      }
      return;
    }
    if (linesForProjectIdRef.current === project.id) return;

    linesForProjectIdRef.current = project.id;
    setVehicleNo(project.draft?.vehicleNo ?? "");
    setReceiverName(project.draft?.receiverName ?? "");
    setReceiverMobile(project.draft?.receiverMobile ?? "");
    setRemarks(project.draft?.remarks ?? "");

    setLines(
      project.lines.map((item) => ({
        materialLineId: item.materialLineId,
        productId: item.productId,
        productName: item.productName,
        serialTracking: item.serialTracking,
        remainingQty: item.remainingQty,
        qty: "0",
        kitProductId: item.kitProductId,
        kitProductName: item.kitProductName,
        kitBomQty: item.kitBomQty,
        serials: [],
        pasteText: "",
        invalidSerials: [],
        lookingUp: false,
      })),
    );
  }, [projectId, projects]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => {
      const next = current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      );
      linesRef.current = next;
      return next;
    });
  }

  function removeSerial(lineIndex: number, serialId: string) {
    setLines((current) => {
      const next = current.map((line, index) => {
        if (index !== lineIndex) return line;
        const serials = line.serials.filter((serial) => serial.id !== serialId);
        return { ...line, serials, qty: String(serials.length || line.qty) };
      });
      linesRef.current = next;
      return next;
    });
  }

  async function lookupAndAddSerials(
    lineIndex: number,
    serialNumbers: string[],
  ): Promise<SerialScanResult> {
    const line = linesRef.current[lineIndex];
    const currentProjectId = projectIdRef.current;
    if (!line || !currentProjectId) {
      return { ok: false, reason: "Select a project first." };
    }
    if (serialNumbers.length > MAX_SERIALS_PER_ENTRY) {
      const reason = serialsPerEntryLimitMessage(serialNumbers.length);
      updateLine(lineIndex, {
        lookingUp: false,
        invalidSerials: [{ serialNumber: "", reason }],
      });
      return { ok: false, reason };
    }

    updateLine(lineIndex, { lookingUp: true, invalidSerials: [] });

    try {
      const response = await fetch("/api/project-dispatches/lookup-serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProjectId,
          productId: line.productId,
          serialNumbers,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const reason = data.message ?? "Unable to look up serial numbers.";
        updateLine(lineIndex, { lookingUp: false, invalidSerials: [{ serialNumber: "", reason }] });
        return { ok: false, reason };
      }

      const latest = linesRef.current[lineIndex] ?? line;
      const existingIds = new Set(latest.serials.map((serial) => serial.id));
      const added: SelectedSerial[] = [];
      const invalid: InvalidSerial[] = [...(data.invalid ?? [])];

      for (const found of data.valid ?? []) {
        if (existingIds.has(found.id)) {
          invalid.push({ serialNumber: found.serialNumber, reason: "Already added." });
          continue;
        }
        added.push({ id: found.id, serialNumber: found.serialNumber });
        existingIds.add(found.id);
      }

      const serials = [...latest.serials, ...added];
      updateLine(lineIndex, {
        lookingUp: false,
        serials,
        qty: String(serials.length),
        pasteText: "",
        invalidSerials: invalid,
      });

      if (added.length === 0) {
        const first = invalid[0];
        return {
          ok: false,
          reason: first?.reason ?? "No valid serial numbers found.",
        };
      }

      return { ok: true, message: added.map((serial) => serial.serialNumber).join(", ") };
    } catch {
      updateLine(lineIndex, {
        lookingUp: false,
        invalidSerials: [{ serialNumber: "", reason: "Unable to look up serial numbers." }],
      });
      return { ok: false, reason: "Unable to look up serial numbers." };
    }
  }

  const handleScannedSerials = useCallback(
    async (serialNumbers: string[]): Promise<SerialScanResult> => {
      if (scannerLineIndex === null) {
        return { ok: false, reason: "No dispatch line selected for scanning." };
      }
      return lookupAndAddSerials(scannerLineIndex, serialNumbers);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scannerLineIndex],
  );

  async function handleSubmit() {
    if (!vehicleNo.trim() || !receiverName.trim() || !receiverMobile.trim()) {
      setError("Vehicle number, receiver name, and receiver mobile are required.");
      return;
    }

    const dispatchLines = lines.filter((line) => effectiveDispatchQty(line) > 0);
    if (dispatchLines.length === 0) {
      setError("Enter dispatch quantity for at least one line.");
      return;
    }

    if (isPartialDispatch(lines)) {
      const confirmed = window.confirm(
        formatPartialDispatchConfirmMessage(describePartialDispatchLines(lines)),
      );
      if (!confirmed) return;
    }

    setLoading(true);
    setError("");

    const payload = {
      projectId,
      vehicleNo: vehicleNo.trim(),
      receiverName: receiverName.trim(),
      receiverMobile: normalizeMobileNumber(receiverMobile),
      signatureData: signatureData || undefined,
      remarks: remarks || undefined,
      confirm: true,
      lines: dispatchLines
        .map((line) => ({
          materialLineId: line.materialLineId,
          productId: line.productId,
          qty: effectiveDispatchQty(line),
          serialIds: line.serialTracking ? line.serials.map((serial) => serial.id) : undefined,
          kitProductId: line.kitProductId,
          kitProductName: line.kitProductName,
          kitBomQty: line.kitBomQty,
        })),
    };

    try {
      const response = await fetch("/api/project-dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "Unable to create project dispatch.");
        return;
      }
      router.push(`/inventory/dispatches/projects/${data.id}`);
    } catch {
      setError("Unable to create project dispatch. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((row) => row.id === projectId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Project Dispatch</h1>
          <p className="text-sm text-slate-500">
            Dispatch material from Jalgaon Projects to the customer site.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/inventory/dispatches?tab=projects">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatch Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Project</Label>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="flex h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-base"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectNo} · {project.proposalNo} · {project.customerName}
                </option>
              ))}
            </select>
            {selectedProject ? (
              <p className="text-sm text-slate-500">Site: {selectedProject.siteAddress}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Vehicle No *</Label>
            <Input className="h-12 text-base" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Receiver Name *</Label>
            <Input className="h-12 text-base" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Receiver Mobile *</Label>
            <Input className="h-12 text-base" value={receiverMobile} onChange={(e) => setReceiverMobile(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Remarks</Label>
            <Input className="h-12 text-base" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Material Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => (
            <div key={`${line.materialLineId}-${line.productId}`} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{line.productName}</p>
                  <p className="text-sm text-slate-500">Qty reserved for project: {line.remainingQty}</p>
                </div>
                {!line.serialTracking ? (
                  <div className="space-y-1">
                    <Label>Dispatch Qty</Label>
                    <Input
                      type="number"
                      min={0}
                      max={line.remainingQty}
                      className="h-10 w-28 text-right"
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                    />
                  </div>
                ) : null}
              </div>

              {line.serialTracking ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ScanSerialsButton onClick={() => setScannerLineIndex(index)} />
                    <Input
                      placeholder="Paste serial numbers…"
                      value={line.pasteText}
                      onChange={(e) => updateLine(index, { pasteText: e.target.value })}
                      className="min-w-[200px] flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={line.lookingUp}
                      onClick={() => void lookupAndAddSerials(index, parseSerialPaste(line.pasteText))}
                    >
                      Add Serials
                    </Button>
                  </div>
                  {line.serials.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {line.serials.map((serial) => (
                        <span
                          key={serial.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm"
                        >
                          {serial.serialNumber}
                          <button type="button" onClick={() => removeSerial(index, serial.id)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {line.invalidSerials.length > 0 ? (
                    <ul className="text-sm text-red-600">
                      {line.invalidSerials.map((item, idx) => (
                        <li key={`${item.serialNumber}-${idx}`}>
                          {item.serialNumber ? `${normalizeSerialNumber(item.serialNumber)} — ` : ""}
                          {item.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receiver Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <SignaturePad onChange={setSignatureData} />
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={loading} onClick={() => void handleSubmit()}>
          {loading ? "Confirming…" : "Confirm Project Dispatch"}
        </Button>
      </div>

      <SerialScanner
        open={scannerLineIndex !== null}
        onClose={() => setScannerLineIndex(null)}
        onScan={handleScannedSerials}
      />
    </div>
  );
}
