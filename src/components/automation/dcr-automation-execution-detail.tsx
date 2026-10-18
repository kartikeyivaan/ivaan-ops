"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  automationStatusBadgeVariant,
  formatAutomationStatus,
} from "@/components/automation/automation-status-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ExecutionDetail = {
  id: string;
  status: string;
  progressDone: number;
  progressTotal: number;
  portalStrategy: string;
  includeEarlyDcr: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  initiatedBy: { name: string };
  portalAttempts: {
    id: string;
    portal: string;
    status: string;
    errorMessage: string | null;
    externalDcrNumber: string | null;
    queueItem: {
      dispatch: { dcNo: string; proformaInvoice: { piNo: string } };
      dispatchLine: { product: { displayName: string } };
    };
    screenshots: { id: string; storageUrl: string; fileName: string | null; capturedAt: string }[];
  }[];
  events: { id: string; eventType: string; message: string; createdAt: string }[];
};

export function DcrAutomationExecutionDetail({
  initial,
  canRun,
}: {
  initial: ExecutionDetail;
  canRun: boolean;
}) {
  const [execution, setExecution] = useState(initial);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (execution.status === "COMPLETED" || execution.status === "CANCELLED" || execution.status === "FAILED") {
      return;
    }
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch(`/api/automation/executions/${execution.id}?omitScreenshots=1`);
      if (!response.ok) return;
      const next = (await response.json()) as ExecutionDetail;
      setExecution((prev) => ({
        ...next,
        portalAttempts: next.portalAttempts.map((attempt) => {
          const prior = prev.portalAttempts.find((row) => row.id === attempt.id);
          const screenshots = "screenshots" in attempt && attempt.screenshots?.length
            ? attempt.screenshots
            : prior?.screenshots ?? [];
          return { ...attempt, screenshots };
        }),
      }));
    }, 5000);
    return () => clearInterval(timer);
  }, [execution.id, execution.status]);

  async function cancelRun() {
    if (!canRun) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/automation/executions/${execution.id}`, { method: "DELETE" });
      if (response.ok) {
        const refreshed = await fetch(`/api/automation/executions/${execution.id}`);
        if (refreshed.ok) setExecution(await refreshed.json());
      }
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automation run</h1>
          <p className="text-sm text-slate-500">
            Started {new Date(execution.createdAt).toLocaleString()} by {execution.initiatedBy.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/documentation/automation">Back to queue</Link>
          </Button>
          {canRun && execution.status !== "COMPLETED" && execution.status !== "CANCELLED" ? (
            <Button variant="outline" onClick={() => void cancelRun()} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cancel run
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <Badge variant={automationStatusBadgeVariant(execution.status)}>
            {formatAutomationStatus(execution.status)}
          </Badge>
          <span className="text-sm text-slate-600">
            Progress {execution.progressDone} / {execution.progressTotal}
          </span>
          <span className="text-sm text-slate-600">
            Portal: {execution.portalStrategy.replaceAll("_", " ")}
          </span>
          {execution.includeEarlyDcr ? (
            <span className="text-sm text-amber-700">Early DCR included</span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Portal attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DCR</TableHead>
                <TableHead>Screenshots</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {execution.portalAttempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    <div className="font-medium">{attempt.queueItem.dispatch.proformaInvoice.piNo}</div>
                    <div className="text-xs text-slate-500">
                      {attempt.queueItem.dispatch.dcNo} · {attempt.queueItem.dispatchLine.product.displayName}
                    </div>
                    {attempt.errorMessage ? (
                      <p className="mt-1 text-xs text-red-600">{attempt.errorMessage}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{attempt.portal}</TableCell>
                  <TableCell>
                    <Badge variant={automationStatusBadgeVariant(attempt.status)}>
                      {formatAutomationStatus(attempt.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{attempt.externalDcrNumber ?? "—"}</TableCell>
                  <TableCell>
                    {attempt.screenshots.length ? (
                      <ul className="space-y-1">
                        {attempt.screenshots.map((shot) => (
                          <li key={shot.id}>
                            <a
                              href={shot.storageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-emerald-700 underline"
                            >
                              {shot.fileName ?? "View screenshot"}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Event log</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {execution.events.map((event) => (
            <div key={event.id} className="rounded border border-slate-100 px-3 py-2">
              <p className="text-xs text-slate-500">
                {new Date(event.createdAt).toLocaleTimeString()} · {event.eventType}
              </p>
              <p className="text-slate-800">{event.message}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
