"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { SerialScanner, type SerialScanResult } from "@/components/inventory/serial-scanner";

type Row = { productId: string; product: string; inStock: number; scanned: number; isUnknown: boolean };
type ScanOutcome = "FOUND" | "ADDITIONAL" | "ALREADY_SCANNED";
type ScanReply = { counts: Record<ScanOutcome, number> };

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.message ?? fallback;
}

export function MonthlyAuditSerialPanel({
  auditId,
  canScan,
  isOpen,
}: {
  auditId: string;
  canScan: boolean;
  isOpen: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanReply | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/serial-summary`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readError(res, "Could not load serial numbers."));
      return;
    }
    const body = await res.json();
    setRows(body.rows);
  }, [auditId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [isOpen, load]);

  // Every scan is saved on the server straight away; there is no staging list.
  async function postScans(serials: string | string[], source: "CAMERA" | "SCANNER" | "PASTE") {
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serials, source }),
    });
    if (!res.ok) throw new Error(await readError(res, "Scan failed."));
    return (await res.json()) as ScanReply;
  }

  async function submitPaste() {
    if (!pasteText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setLastScan(await postScans(pasteText, "PASTE"));
      setPasteText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCameraOrScanner(serials: string[]): Promise<SerialScanResult> {
    try {
      const reply = await postScans(serials, "SCANNER");
      setLastScan(reply);
      void load();
      if (reply.counts.ALREADY_SCANNED > 0) {
        return { ok: false, reason: "Already scanned by someone in this audit." };
      }
      return { ok: true, message: reply.counts.ADDITIONAL > 0 ? "New unknown serial saved." : "Saved." };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Scan failed." };
    }
  }

  const canScanNow = canScan && isOpen;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link href={`/inventory/monthly-audits/${auditId}`} className="text-sm text-slate-500 underline">
          ← Back
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Serial Numbered Products</h1>
      </div>

      {canScanNow && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
            >
              Camera / scanner
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-700" htmlFor="paste-serials">
              Or paste serial numbers (one per line or comma-separated)
            </label>
            <textarea
              id="paste-serials"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2 font-mono text-sm"
            />
            <button
              type="button"
              onClick={submitPaste}
              disabled={busy || !pasteText.trim()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Save pasted serials
            </button>
          </div>
          {lastScan && (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              Last save: {lastScan.counts.FOUND} found, {lastScan.counts.ADDITIONAL} new unknown,{" "}
              {lastScan.counts.ALREADY_SCANNED} already scanned.
            </p>
          )}
          <SerialScanner
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={onCameraOrScanner}
            title="Scan monthly audit serials"
          />
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows === null ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">In Stock (ISE + PCMV)</th>
                <th className="px-3 py-2 text-right">Scanned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.isUnknown ? "unknown" : row.productId}
                  className={`border-t border-slate-100 ${row.isUnknown ? "font-semibold" : ""}`}
                >
                  <td className="px-3 py-2">{row.product}</td>
                  <td className="px-3 py-2 text-right">{row.isUnknown ? "-" : row.inStock}</td>
                  <td className="px-3 py-2 text-right">{row.scanned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
