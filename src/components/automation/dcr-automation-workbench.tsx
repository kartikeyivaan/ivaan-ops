"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Monitor, Play, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  automationStatusBadgeVariant,
  formatAutomationStatus,
} from "@/components/automation/automation-status-utils";
import {
  DCR_PORTAL_STRATEGIES,
  DEFAULT_DCR_PORTAL_STRATEGY,
  type DcrPortalStrategy,
} from "@/lib/dcr-documentation-eligibility";

type CompanyOption = { id: string; code: string; name: string };

type QueueRow = {
  id: string;
  status: string;
  externalDcrNumber: string | null;
  lastError: string | null;
  requiresManual: boolean;
  company: { code: string; name: string };
  dispatch: {
    dcNo: string;
    proformaInvoice: { piNo: string };
  };
  dispatchLine: {
    qty: string | number;
    product: { displayName: string };
    serials: { serial: { serialNumber: string } }[];
  };
  documentationRecord: {
    invoiceHandover: {
      invoiceNumber: string | null;
      status: string;
    };
  };
};

type ExecutionSummary = {
  id: string;
  status: string;
  progressDone: number;
  progressTotal: number;
  portalStrategy: string;
  includeEarlyDcr: boolean;
  createdAt: string;
  initiatedBy: { name: string };
  device: { label: string | null; lastSeenAt: string | null } | null;
  companies: { company: { code: string; name: string } }[];
};

type AgentStatus = {
  connected: boolean;
  devices: { id: string; label: string | null; lastSeenAt: string | null; agentVersion: string | null }[];
};

const PORTAL_LABELS: Record<DcrPortalStrategy, string> = {
  PCMV_THEN_ISE: "PCMV first, then ISE",
  ISE_THEN_PCMV: "ISE first, then PCMV",
  PCMV_ONLY: "PCMV only",
  ISE_ONLY: "ISE only",
};

export function DcrAutomationWorkbench({
  companies,
  canRun,
}: {
  companies: CompanyOption[];
  canRun: boolean;
}) {
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>(() => companies.map((c) => c.id));
  const [includeEarlyDcr, setIncludeEarlyDcr] = useState(false);
  const [portalStrategy, setPortalStrategy] = useState<DcrPortalStrategy>(DEFAULT_DCR_PORTAL_STRATEGY);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [agentRelease, setAgentRelease] = useState<{
    version: string;
    downloadUrl: string;
    sha256: string;
    fileName: string;
  } | null>(null);
  const [downloadingAgent, setDownloadingAgent] = useState(false);
  const [search, setSearch] = useState("");

  const companyQuery = useMemo(
    () => selectedCompanyIds.join(","),
    [selectedCompanyIds],
  );

  const refreshQueue = useCallback(async () => {
    if (!selectedCompanyIds.length) {
      setQueue([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        companyIds: companyQuery,
        includeEarlyDcr: includeEarlyDcr ? "true" : "false",
      });
      const response = await fetch(`/api/automation/queue?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to load queue.");
      setQueue(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load queue.");
    } finally {
      setLoading(false);
    }
  }, [companyQuery, includeEarlyDcr, selectedCompanyIds.length]);

  const refreshExecutions = useCallback(async () => {
    if (!selectedCompanyIds.length) return;
    const params = new URLSearchParams({ companyIds: companyQuery });
    const response = await fetch(`/api/automation/executions?${params}`);
    const data = await response.json();
    if (response.ok) setExecutions(data);
  }, [companyQuery, selectedCompanyIds.length]);

  const refreshAgentStatus = useCallback(async () => {
    const response = await fetch("/api/automation/agent/status");
    const data = await response.json();
    if (response.ok) setAgentStatus(data);
  }, []);

  const refreshAgentRelease = useCallback(async () => {
    const response = await fetch("/api/automation/agent/releases/latest");
    const data = await response.json();
    if (response.ok) setAgentRelease(data);
  }, []);

  useEffect(() => {
    void refreshQueue();
    void refreshExecutions();
    void refreshAgentStatus();
    void refreshAgentRelease();
  }, [refreshQueue, refreshExecutions, refreshAgentStatus, refreshAgentRelease]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshAgentStatus();
      void refreshExecutions();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshAgentStatus, refreshExecutions]);

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((row) =>
      [
        row.dispatch.dcNo,
        row.dispatch.proformaInvoice.piNo,
        row.dispatchLine.product.displayName,
        row.company.code,
        row.externalDcrNumber ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [queue, search]);

  function toggleCompany(id: string) {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function toggleQueueRow(id: string) {
    setSelectedQueueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function syncQueue() {
    if (!canRun || !selectedCompanyIds.length) return;
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/automation/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: selectedCompanyIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Sync failed.");
      await refreshQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function startRun() {
    if (!canRun || !selectedCompanyIds.length) return;
    setStarting(true);
    setError("");
    try {
      const queueItemIds = selectedQueueIds.size
        ? Array.from(selectedQueueIds)
        : undefined;
      const response = await fetch("/api/automation/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyIds: selectedCompanyIds,
          portalStrategy,
          includeEarlyDcr,
          queueItemIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to start run.");
      setSelectedQueueIds(new Set());
      await Promise.all([refreshQueue(), refreshExecutions()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start run.");
    } finally {
      setStarting(false);
    }
  }

  async function createPairingCode() {
    if (!canRun) return;
    setError("");
    const response = await fetch("/api/automation/devices/pair", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "Unable to create pairing code.");
      return;
    }
    setPairingCode(data.pairingCode);
  }

  async function downloadAgentInstaller() {
    setDownloadingAgent(true);
    setError("");
    try {
      let release = agentRelease;
      if (!release) {
        const response = await fetch("/api/automation/agent/releases/latest");
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Unable to load agent download.");
        release = data;
        setAgentRelease(data);
      }
      if (!release?.downloadUrl) {
        throw new Error(
          "Agent installer URL is not configured yet. Ask IT or use the developer setup in packages/automation-agent.",
        );
      }
      window.open(release.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to download agent.");
    } finally {
      setDownloadingAgent(false);
    }
  }

  const runnableSelected = selectedQueueIds.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Share DCR to Customers</h1>
          <p className="text-sm text-slate-500">
            Browser automation queue for government DCR portal work (local agent required).
          </p>
        </div>
        <Button variant="outline" asChild className="h-11">
          <Link href="/documentation">Documentation</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Run settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Companies</Label>
              <div className="flex flex-wrap gap-3">
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.includes(company.id)}
                      onChange={() => toggleCompany(company.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {company.code}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="portal-strategy">Portal strategy</Label>
                <select
                  id="portal-strategy"
                  className="mt-1 flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={portalStrategy}
                  onChange={(e) => setPortalStrategy(e.target.value as DcrPortalStrategy)}
                  disabled={!canRun}
                >
                  {DCR_PORTAL_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {PORTAL_LABELS[strategy]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeEarlyDcr}
                    onChange={(e) => setIncludeEarlyDcr(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Include early DCR (before invoice recorded)
                </label>
              </div>
            </div>
            {canRun ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void syncQueue()} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync queue
                </Button>
                <Button type="button" onClick={() => void startRun()} disabled={starting}>
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Start automation
                  {runnableSelected ? ` (${runnableSelected} selected)` : ""}
                </Button>
                <Button type="button" variant="outline" onClick={() => void createPairingCode()}>
                  <Monitor className="h-4 w-4" />
                  Pair agent
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Automation agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {canRun ? (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full"
                  disabled={downloadingAgent}
                  onClick={() => void downloadAgentInstaller()}
                >
                  {downloadingAgent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download agent
                  {agentRelease?.version ? ` (v${agentRelease.version})` : ""}
                </Button>
                {agentRelease?.sha256 ? (
                  <p className="text-xs text-slate-500 break-all" title={agentRelease.sha256}>
                    SHA-256: {agentRelease.sha256.slice(0, 16)}…
                  </p>
                ) : null}
              </div>
            ) : null}
            {agentStatus?.connected ? (
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Wifi className="h-4 w-4" />
                Connected
              </p>
            ) : (
              <p className="flex items-center gap-2 font-medium text-amber-800">
                <WifiOff className="h-4 w-4" />
                Offline — start the Ivaan Ops Automation Agent on your computer.
              </p>
            )}
            {agentStatus?.devices.length ? (
              <ul className="space-y-1 text-slate-600">
                {agentStatus.devices.map((device) => (
                  <li key={device.id}>
                    {device.label ?? "Device"} · {device.agentVersion ?? "unknown version"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">No paired devices yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">Automation queue</CardTitle>
          <div className="relative w-full max-w-xs">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PI, DC, product…"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queue…
            </p>
          ) : (
            <Table responsive>
              <TableHeader>
                <TableRow>
                  {canRun ? <TableHead className="w-10" /> : null}
                  <TableHead>PI / DC</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>DCR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQueue.map((row) => (
                  <TableRow key={row.id}>
                    {canRun ? (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedQueueIds.has(row.id)}
                          onChange={() => toggleQueueRow(row.id)}
                          aria-label="Select line"
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.dispatch.proformaInvoice.piNo}</div>
                      <div className="text-xs text-slate-500">
                        {row.dispatch.dcNo} · {row.company.code}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={row.dispatchLine.product.displayName}>
                      {row.dispatchLine.product.displayName}
                    </TableCell>
                    <TableCell>{String(row.dispatchLine.qty)}</TableCell>
                    <TableCell>
                      {row.documentationRecord.invoiceHandover.invoiceNumber ?? (
                        <span className="text-amber-700">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={automationStatusBadgeVariant(row.status)}>{formatAutomationStatus(row.status)}</Badge>
                      {row.requiresManual ? (
                        <p className="mt-1 text-xs text-red-600">Manual documentation required</p>
                      ) : null}
                      {row.lastError ? (
                        <p className="mt-1 max-w-[200px] truncate text-xs text-red-600" title={row.lastError}>
                          {row.lastError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.externalDcrNumber ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && !filteredQueue.length ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No eligible lines. Sync the queue or adjust company / early DCR filters.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {executions.length ? (
            executions.map((run) => (
              <Link
                key={run.id}
                href={`/documentation/automation/executions/${run.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-4 py-3 transition hover:border-emerald-200"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {run.companies.map((c) => c.company.code).join(", ")} · {PORTAL_LABELS[run.portalStrategy as DcrPortalStrategy] ?? run.portalStrategy}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(run.createdAt).toLocaleString()} · {run.initiatedBy.name}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={automationStatusBadgeVariant(run.status)}>{formatAutomationStatus(run.status)}</Badge>
                  <p className="mt-1 text-xs text-slate-500">
                    {run.progressDone} / {run.progressTotal}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No automation runs yet.</p>
          )}
        </CardContent>
      </Card>

      {pairingCode ? (
        <Modal onClose={() => setPairingCode(null)} size="sm">
          <ModalHeader title="Pair local agent" onClose={() => setPairingCode(null)} />
          <ModalBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Install the agent with <strong>Download agent</strong>, then enter this code in the Ivaan Ops
              DCR Agent app within 15 minutes:
            </p>
            <p className="rounded-lg bg-slate-100 py-4 text-center font-mono text-2xl tracking-widest">
              {pairingCode}
            </p>
          </ModalBody>
        </Modal>
      ) : null}
    </div>
  );
}
