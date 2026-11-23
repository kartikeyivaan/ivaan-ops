"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  serialNumber: string;
  type: "MISSING" | "ADDITIONAL";
  product: string;
  company: string;
  warehouse: string;
  serialStatus: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  hasRecord: boolean;
};
type Data = { type: string; status: string; closedAt: string | null; rows: Row[] };

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.message ?? fallback;
}

const RESOLUTION_LABEL: Record<string, string> = {
  FOUND: "Found (back in stock)",
  WRITE_OFF: "Written off",
  ADDED: "Added to stock",
  SOLD: "Sold (dispatched)",
};

/** A resolved item that can be reverted (SOLD cannot be undone here). */
const isUndoable = (r: Row) => Boolean(r.resolvedAt && r.resolution && r.resolution !== "SOLD");

const DEFAULT_FILTERS ={ search: "", status: "ALL" as const, resolution: "ALL", company: "ALL", warehouse: "ALL", product: "ALL" };

export function MonthlyAuditInvestigation({
  auditId,
  auditNumber,
  canManage,
}: {
  auditId: string;
  auditNumber: string;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"MISSING" | "ADDITIONAL">("MISSING");
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasteText, setPasteText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "ALL" as "ALL" | "OPEN" | "RESOLVED",
    resolution: "ALL" as string,
    company: "ALL",
    warehouse: "ALL",
    product: "ALL",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/investigation?type=${tab}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError(await readError(res, "Could not load investigation."));
      return;
    }
    setData(await res.json());
    setSelected(new Set());
  }, [auditId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const closed = Boolean(data?.closedAt);
  const selectedRows = (data?.rows ?? []).filter((r) => selected.has(r.id) && !r.resolvedAt);
  const selectedUndoRows = (data?.rows ?? []).filter((r) => selected.has(r.id) && isUndoable(r));

  const allRows = data?.rows ?? [];
  const uniq = (pick: (r: Row) => string) => Array.from(new Set(allRows.map(pick).filter(Boolean))).sort();
  const companies = uniq((r) => r.company);
  const warehouses = uniq((r) => r.warehouse);
  const products = uniq((r) => r.product);
  const q = filters.search.trim().toUpperCase();
  const visibleRows = allRows.filter((r) => {
    if (q && !r.serialNumber.toUpperCase().includes(q)) return false;
    if (filters.status === "OPEN" && r.resolvedAt) return false;
    if (filters.status === "RESOLVED" && !r.resolvedAt) return false;
    if (filters.resolution !== "ALL" && (r.resolution ?? "OPEN") !== filters.resolution) return false;
    if (filters.company !== "ALL" && r.company !== filters.company) return false;
    if (filters.warehouse !== "ALL" && r.warehouse !== filters.warehouse) return false;
    if (filters.product !== "ALL" && r.product !== filters.product) return false;
    return true;
  });
  const visibleOpen = visibleRows.filter((r) => !r.resolvedAt);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPasted() {
    const numbers = pasteText.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const selectable = (r: Row) => !r.resolvedAt || isUndoable(r);
    const rows = (data?.rows ?? []).filter((r) => selectable(r) && numbers.includes(r.serialNumber.toUpperCase()));
    setSelected(new Set(rows.map((r) => r.id)));
    const missing = numbers.filter((n) => !(data?.rows ?? []).some((r) => r.serialNumber.toUpperCase() === n && selectable(r)));
    setNotice(
      missing.length
        ? `${rows.length} selected. Not open in this tab: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`
        : `${rows.length} selected.`,
    );
  }

  async function resolve(action: "FOUND" | "WRITE_OFF" | "ADDED") {
    if (selectedRows.length === 0) return;
    const label = action === "FOUND" ? "return to stock" : action === "WRITE_OFF" ? "write off" : "mark as added";
    if (!confirm(`${selectedRows.length} serial(s) will be set to: ${label}. Continue?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/investigation/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        findingIds: selectedRows.map((r) => r.id),
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await readError(res, "Could not update serials."));
      await load();
      return;
    }
    const body = await res.json();
    setNotice(`${body.resolved} serial(s) updated.`);
    setNote("");
    await load();
  }

  async function closeOrReopen(action: "close" | "reopen") {
    let body: Record<string, unknown> | undefined;
    if (action === "reopen") {
      const reason = prompt("Reason for reopening the investigation (required):");
      if (!reason || reason.trim().length < 3) return;
      body = { reason };
    } else if (!confirm("Close the investigation? Every item must be resolved first.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/investigation/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(await readError(res, "Action failed."));
      return;
    }
    setNotice(action === "close" ? "Investigation closed." : "Investigation reopened.");
    await load();
  }

  async function undoRows(rows: Row[]) {
    if (rows.length === 0) return;
    const label = rows.length === 1 ? rows[0].serialNumber : `${rows.length} serial(s)`;
    const reason = prompt(`Reason for undoing the resolution of ${label} (required):`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/investigation/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingIds: rows.map((r) => r.id), reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await readError(res, "Could not undo the resolution."));
      await load();
      return;
    }
    const body = await res.json();
    setNotice(`${body.undone} serial(s) reopened for investigation.`);
    await load();
  }

  const canAct = canManage && !closed;
  const hasOpenInTab = visibleOpen.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link href={`/inventory/monthly-audits/${auditId}`} className="text-sm text-slate-500 underline">
          ← Back to {auditNumber}
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Investigation: {auditNumber}</h1>
        <p className="text-sm text-slate-600">
          {closed ? "Investigation closed." : "Investigation open."} Sold serials close automatically when they are dispatched.
        </p>
      </div>

      <div className="flex gap-2">
        <TabButton active={tab === "MISSING"} onClick={() => setTab("MISSING")}>
          Investigation: Missing
        </TabButton>
        <TabButton active={tab === "ADDITIONAL"} onClick={() => setTab("ADDITIONAL")}>
          Investigation: New addition
        </TabButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-slate-700">{notice}</p>}

      {data === null ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          {canAct && (
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-700" htmlFor="inv-paste">
                  Paste serial numbers to select them
                </label>
                <div className="flex flex-wrap gap-2">
                  <textarea
                    id="inv-paste"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={2}
                    className="min-w-[16rem] flex-1 rounded-md border border-slate-300 p-2 font-mono text-sm"
                  />
                  <button type="button" onClick={selectPasted} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                    Select pasted
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="min-w-[14rem] rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
                {tab === "MISSING" || data.rows.some((r) => r.hasRecord) ? (
                  <button
                    type="button"
                    disabled={busy || selectedRows.length === 0}
                    onClick={() => resolve("FOUND")}
                    className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Found ({selectedRows.length})
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || selectedRows.length === 0}
                  onClick={() => resolve("WRITE_OFF")}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  Write off ({selectedRows.length})
                </button>
                {canAct && selectedUndoRows.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => undoRows(selectedUndoRows)}
                    className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
                  >
                    Undo selected ({selectedUndoRows.length})
                  </button>
                )}
                {tab === "ADDITIONAL" && (
                  <button
                    type="button"
                    disabled={busy || selectedRows.length === 0}
                    onClick={() => resolve("ADDED")}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Mark added ({selectedRows.length})
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                &quot;Mark added&quot; applies after the serial is entered through manual stock entry.
              </p>
            </section>
          )}

          <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search serial number"
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as "ALL" | "OPEN" | "RESOLVED" })}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>
            <select
              value={filters.resolution}
              onChange={(e) => setFilters({ ...filters, resolution: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All resolutions</option>
              <option value="OPEN">Open (not resolved)</option>
              <option value="FOUND">Found</option>
              <option value="SOLD">Sold</option>
              <option value="WRITE_OFF">Written off</option>
              <option value="ADDED">Added</option>
            </select>
            <select
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filters.warehouse}
              onChange={(e) => setFilters({ ...filters, warehouse: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={filters.product}
                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="ALL">All products</option>
                {products.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 md:col-span-3 lg:col-span-6">
              Showing {visibleRows.length} of {allRows.length} serials.
            </p>
          </section>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">
                    {canAct && hasOpenInTab && (
                      <input
                        type="checkbox"
                        aria-label="Select all open"
                        checked={selectedRows.length === visibleOpen.length && visibleOpen.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? new Set(visibleOpen.map((r) => r.id)) : new Set())}
                      />
                    )}
                  </th>
                  <th className="px-3 py-2">Serial number</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Warehouse</th>
                  <th className="px-3 py-2">Current status</th>
                  <th className="px-3 py-2">Resolution</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                      No items in this list.
                    </td>
                  </tr>
                )}
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {canAct && (!row.resolvedAt || isUndoable(row)) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.serialNumber}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.serialNumber}</td>
                    <td className="px-3 py-2">{row.product}</td>
                    <td className="px-3 py-2">{row.company}</td>
                    <td className="px-3 py-2">{row.warehouse}</td>
                    <td className="px-3 py-2">{row.serialStatus ?? "Not in system"}</td>
                    <td className="px-3 py-2">
                      {row.resolution ? RESOLUTION_LABEL[row.resolution] ?? row.resolution : "Open"}
                      {canAct && row.resolution && row.resolution !== "SOLD" && (
                        <button
                          type="button"
                          onClick={() => undoRows([row])}
                          disabled={busy}
                          className="ml-2 text-xs text-rose-600 underline disabled:opacity-50"
                        >
                          Undo
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.resolutionNote ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canManage && (
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-900">Close investigation</h2>
              {closed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => closeOrReopen("reopen")}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  Reopen investigation
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => closeOrReopen("close")}
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Close investigation
                </button>
              )}
              <p className="text-xs text-slate-500">
                Closing needs every missing and new-addition item resolved. Both tabs are checked.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm ${active ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
    >
      {children}
    </button>
  );
}
