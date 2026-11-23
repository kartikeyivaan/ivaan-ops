"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type QtyLine = {
  id: string;
  recordQty: number | null;
  auditQty: number | null;
  varianceQty: number | null;
  approved: boolean;
  product: { displayName: string };
  warehouse: { name: string };
  company: { name: string };
};

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.message ?? fallback;
}

export function MonthlyAuditNonSerialPanel({
  auditId,
  canCount,
  isOpen,
}: {
  auditId: string;
  canCount: boolean;
  isOpen: boolean;
}) {
  const [lines, setLines] = useState<QtyLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readError(res, "Could not load counts."));
      return;
    }
    const body = await res.json();
    setLines(body.qty);
  }, [auditId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCount(lineId: string, value: string) {
    const auditQty = Number(value);
    if (value.trim() === "" || !Number.isFinite(auditQty) || auditQty < 0) {
      setError("Enter a quantity of zero or more.");
      return;
    }
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/qty-lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditQty }),
    });
    if (!res.ok) {
      setError(await readError(res, "Could not save count."));
      return;
    }
    setError(null);
    await load();
  }

  const editable = canCount && isOpen;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link href={`/inventory/monthly-audits/${auditId}`} className="text-sm text-slate-500 underline">
          ← Back
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Non Serial Numbered Products</h1>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {lines === null ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-slate-500">No non-serialized products in this audit.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Warehouse</th>
                <th className="px-3 py-2 text-right">In Stock</th>
                <th className="px-3 py-2 text-right">Counted</th>
                <th className="px-3 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {lines
                // Hide products with no stock on record and nothing counted. Keep rows where something was found.
                .filter((line) => !(Number(line.recordQty ?? 0) === 0 && Number(line.auditQty ?? 0) === 0))
                .map((line) => (
                <CountRow
                  key={line.id}
                  line={line}
                  editable={editable}
                  onSave={(value) => saveCount(line.id, value)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && <AddLineForm auditId={auditId} onAdded={load} />}
    </div>
  );
}

type Option = { id: string; name?: string; displayName?: string; companyId?: string; companyName?: string };

function AddLineForm({ auditId, onAdded }: { auditId: string; onAdded: () => Promise<void> }) {
  const [products, setProducts] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [count, setCount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/inventory/monthly-audits/" + auditId + "/qty-lines", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setProducts(body.products ?? []);
        setWarehouses(body.warehouses ?? []);
      })
      .catch(() => setMessage("Could not load products and warehouses."));
  }, [auditId]);

  async function add() {
    const auditQty = Number(count);
    if (!productId || !warehouseId || count.trim() === "" || !Number.isFinite(auditQty) || auditQty < 0) {
      setMessage("Choose a product, a warehouse and a count of zero or more.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}/qty-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, warehouseId, auditQty }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message ?? "Could not add the product.");
      return;
    }
    setProductId("");
    setWarehouseId("");
    setCount("");
    setMessage("Added.");
    await onAdded();
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Add a product not in the list</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Company and warehouse</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.companyName} - {w.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Counted qty"
          value={count}
          onChange={(e) => {
            if (/^\d*\.?\d{0,3}$/.test(e.target.value)) setCount(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add row"}
        </button>
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </section>
  );
}

function CountRow({
  line,
  editable,
  onSave,
}: {
  line: QtyLine;
  editable: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(line.auditQty?.toString() ?? "");
  useEffect(() => {
    setValue(line.auditQty?.toString() ?? "");
  }, [line.auditQty]);

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">{line.product.displayName}</td>
      <td className="px-3 py-2">{line.company.name}</td>
      <td className="px-3 py-2">{line.warehouse.name}</td>
      <td className="px-3 py-2 text-right">{line.recordQty ?? "-"}</td>
      <td className="px-3 py-2 text-right">
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              // Digits and one decimal point only. Plain text avoids the up/down arrows and mouse wheel changing the value.
              const next = e.target.value;
              if (/^\d*\.?\d{0,3}$/.test(next)) setValue(next);
            }}
            onBlur={() => {
              if (value !== (line.auditQty?.toString() ?? "")) onSave(value);
            }}
            className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right"
          />
        ) : (
          line.auditQty ?? "-"
        )}
      </td>
      <td className="px-3 py-2 text-right">{line.varianceQty ?? "-"}</td>
    </tr>
  );
}
