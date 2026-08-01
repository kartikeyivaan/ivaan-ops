"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Plus, Trash2 } from "lucide-react";
import { SerialScanner } from "@/components/inventory/serial-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeSerialNumber, parseSerialInput } from "@/lib/inventory";
import { CAPACITY_UNITS, generateDisplayName } from "@/lib/products";
import { CapacityUnit } from "@prisma/client";
import { cn } from "@/lib/utils";

function mergeUniqueSerials(current: string[], entries: string[]) {
  const next = [...current];
  const seen = new Set(next.map((item) => normalizeSerialNumber(item)));
  let added = 0;
  let skipped = 0;

  for (const entry of entries.flatMap((value) => parseSerialInput(value))) {
    const normalized = normalizeSerialNumber(entry);
    if (!normalized) continue;
    if (seen.has(normalized)) {
      skipped += 1;
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
    added += 1;
  }

  return { next, added, skipped };
}

type ProductOption = {
  id: string;
  displayName: string;
  serialTracking: boolean;
  category: { name: string };
};

type MasterOption = { id: string; name: string };

type AuditSerial = { id: string; serialNumber: string };

type AuditLine = {
  id: string;
  productId: string;
  condition: "GOOD" | "DAMAGED";
  physicalQty: number;
  remarks: string | null;
  scannedQty: number;
  product: ProductOption;
  serials: AuditSerial[];
};

type OpeningAudit = {
  id: string;
  auditNumber: string;
  status: string;
  warehouse: { id: string; name: string };
  lines: AuditLine[];
};

export function OpeningAuditWorkbench({
  initialAudit,
  products: initialProducts,
  categories,
  brands,
  technologies,
  canEdit,
  canApprove,
  canCreateProduct,
}: {
  initialAudit: OpeningAudit;
  products: ProductOption[];
  categories: MasterOption[];
  brands: MasterOption[];
  technologies: MasterOption[];
  canEdit: boolean;
  canApprove: boolean;
  canCreateProduct: boolean;
}) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [products, setProducts] = useState(initialProducts);
  const [section, setSection] = useState<"GOOD" | "DAMAGED">("GOOD");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [remarks, setRemarks] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const serialsRef = useRef(serials);
  serialsRef.current = serials;
  const [serialInput, setSerialInput] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreateProduct, setShowCreateProduct] = useState(false);

  function resetSerialEntry() {
    serialsRef.current = [];
    setSerials([]);
    setSerialInput("");
  }

  function addSerials(entries: string[]) {
    const merged = mergeUniqueSerials(serialsRef.current, entries);
    serialsRef.current = merged.next;
    setSerials(merged.next);
    return { added: merged.added, skipped: merged.skipped };
  }

  function addSerialsFromText() {
    const parsed = parseSerialInput(serialInput);
    if (parsed.length === 0) {
      setMessage("Type or paste at least one serial number.");
      return;
    }
    const { added, skipped } = addSerials(parsed);
    setSerialInput("");
    if (added === 0 && skipped > 0) {
      setMessage("All typed serials were already added.");
      return;
    }
    setMessage(
      skipped > 0
        ? `Added ${added} serial${added === 1 ? "" : "s"} (${skipped} duplicate skipped).`
        : null,
    );
  }

  const isDraft = audit.status === "DRAFT";
  const selectedProduct = products.find((p) => p.id === productId);

  const goodLines = audit.lines.filter((line) => line.condition === "GOOD");
  const damagedLines = audit.lines.filter((line) => line.condition === "DAMAGED");
  const visibleLines = section === "GOOD" ? goodLines : damagedLines;

  const damagedProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          (p.category.name === "Modules" || p.category.name === "Inverters") &&
          p.serialTracking,
      ),
    [products],
  );

  const selectableProducts = section === "DAMAGED" ? damagedProducts : products;

  async function saveLine() {
    if (!productId || !selectedProduct) return;
    setBusy(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      productId,
      condition: section,
      remarks: remarks || null,
    };
    if (selectedProduct.serialTracking) {
      payload.serialNumbers = serials;
    } else {
      payload.physicalQty = Number(qty || 0);
    }

    const response = await fetch(`/api/inventory/audits/opening/${audit.id}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to save line.");
      return;
    }
    setAudit(data);
    setProductId("");
    setQty("");
    setRemarks("");
    resetSerialEntry();
  }

  async function removeLine(lineId: string) {
    if (!confirm("Remove this line?")) return;
    setBusy(true);
    const response = await fetch(
      `/api/inventory/audits/opening/${audit.id}/lines?lineId=${lineId}`,
      { method: "DELETE" },
    );
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to delete line.");
      return;
    }
    setAudit(data);
  }

  async function runAction(action: "submit" | "approve" | "reject") {
    if (action === "reject") {
      const reason = window.prompt("Rejection reason (min 3 characters):");
      if (reason == null) return;
      if (reason.trim().length < 3) {
        setMessage("A rejection reason is required (min 3 characters).");
        return;
      }
      setBusy(true);
      setMessage(null);
      const response = await fetch(`/api/inventory/audits/opening/${audit.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: reason.trim() }),
      });
      const data = await response.json();
      setBusy(false);
      if (!response.ok) {
        setMessage(data.message ?? "Failed to reject.");
        return;
      }
      setAudit(data);
      router.refresh();
      return;
    }

    const label =
      action === "submit"
        ? "Submit for Super Admin review?"
        : "Approve and create inventory balances? This locks the audit forever.";
    if (!confirm(label)) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/inventory/audits/opening/${audit.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? `Failed to ${action}.`);
      return;
    }
    setAudit(data);
    router.refresh();
  }

  function loadLineForEdit(line: AuditLine) {
    setSection(line.condition);
    setProductId(line.productId);
    setQty(String(line.physicalQty));
    setRemarks(line.remarks ?? "");
    const nextSerials = line.serials.map((s) => s.serialNumber);
    serialsRef.current = nextSerials;
    setSerials(nextSerials);
    setSerialInput("");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-28">
      <div className="flex items-start gap-3">
        <Button variant="outline" asChild className="mt-0.5 shrink-0 h-10 w-10 p-0">
          <Link href="/inventory/audits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{audit.warehouse.name}</h1>
          <p className="text-sm text-slate-500">
            {audit.auditNumber} · {audit.status}
          </p>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          className={cn(
            "h-11 rounded-lg text-sm font-medium",
            section === "GOOD" ? "bg-white shadow text-slate-900" : "text-slate-600",
          )}
          onClick={() => {
            setSection("GOOD");
            setProductId("");
            resetSerialEntry();
            setQty("");
          }}
        >
          Good stock ({goodLines.length})
        </button>
        <button
          type="button"
          className={cn(
            "h-11 rounded-lg text-sm font-medium",
            section === "DAMAGED" ? "bg-white shadow text-slate-900" : "text-slate-600",
          )}
          onClick={() => {
            setSection("DAMAGED");
            setProductId("");
            resetSerialEntry();
            setQty("");
          }}
        >
          Damaged ({damagedLines.length})
        </button>
      </div>

      {section === "DAMAGED" ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
          Damaged section is for Modules and Inverters. Scan or type serials here after finishing Good stock.
        </p>
      ) : null}

      {isDraft && canEdit ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <Label>Product</Label>
          <select
            className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              resetSerialEntry();
              setQty("");
            }}
          >
            <option value="">Select product…</option>
            {selectableProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.displayName}
              </option>
            ))}
          </select>

          {canCreateProduct ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => setShowCreateProduct((v) => !v)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {showCreateProduct ? "Hide create product" : "Create product"}
            </Button>
          ) : null}

          {showCreateProduct && canCreateProduct ? (
            <CreateProductInline
              categories={categories}
              brands={brands}
              technologies={technologies}
              onCreated={(product) => {
                setProducts((prev) =>
                  [...prev, product].sort((a, b) =>
                    a.displayName.localeCompare(b.displayName),
                  ),
                );
                setProductId(product.id);
                setShowCreateProduct(false);
              }}
            />
          ) : null}

          {selectedProduct?.serialTracking ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  Serial qty: {serials.length}
                </p>
                <Button
                  type="button"
                  className="h-11"
                  onClick={() => setScannerOpen(true)}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Scan QR
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-serial-input">Or type / paste serials</Label>
                <textarea
                  id="opening-serial-input"
                  className="min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  placeholder={"SN-001\nSN-002\nSN-003"}
                  value={serialInput}
                  onChange={(event) => setSerialInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      addSerialsFromText();
                    }
                  }}
                  spellCheck={false}
                />
                <p className="text-xs text-slate-500">
                  One per line, or separated by commas / semicolons. Ctrl/Cmd+Enter to add.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={!serialInput.trim()}
                  onClick={() => addSerialsFromText()}
                >
                  Add serials
                </Button>
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {serials.map((serial) => (
                  <li
                    key={serial}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="font-mono text-xs">{serial}</span>
                    <button
                      type="button"
                      className="text-rose-600"
                      onClick={() => {
                        const next = serialsRef.current.filter((item) => item !== serial);
                        serialsRef.current = next;
                        setSerials(next);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : selectedProduct ? (
            <div>
              <Label>Physical qty</Label>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                className="mt-1 h-12 text-base"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
              />
            </div>
          ) : null}

          <div>
            <Label>Remarks (optional)</Label>
            <Input
              className="mt-1 h-12 text-base"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </div>

          <Button
            className="h-12 w-full text-base"
            disabled={busy || !productId}
            onClick={() => void saveLine()}
          >
            Save line
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {section === "GOOD" ? "Good stock lines" : "Damaged module lines"}
        </h2>
        {visibleLines.length === 0 ? (
          <p className="text-sm text-slate-500">No lines yet.</p>
        ) : (
          visibleLines.map((line) => (
            <div
              key={line.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{line.product.displayName}</p>
                  <p className="text-sm text-slate-500">
                    Qty {line.physicalQty}
                    {line.product.serialTracking
                      ? ` · ${line.serials.length} serials`
                      : ""}
                  </p>
                </div>
                {isDraft && canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadLineForEdit(line)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void removeLine(line.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {line.serials.length > 0 ? (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto font-mono text-xs text-slate-600">
                  {line.serials.map((serial) => (
                    <li key={serial.id}>{serial.serialNumber}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          {isDraft && canEdit ? (
            <Button
              className="h-12 flex-1 text-base"
              disabled={busy}
              onClick={() => void runAction("submit")}
            >
              Submit for review
            </Button>
          ) : null}
          {audit.status === "SUBMITTED" && canApprove ? (
            <>
              <Button
                className="h-12 flex-1 text-base"
                disabled={busy}
                onClick={() => void runAction("approve")}
              >
                Approve opening stock
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1 text-base"
                disabled={busy}
                onClick={() => void runAction("reject")}
              >
                Reject
              </Button>
            </>
          ) : null}
          {audit.status === "APPROVED" ? (
            <p className="w-full text-center text-sm text-emerald-700">
              Approved & locked
            </p>
          ) : null}
        </div>
      </div>

      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan serial numbers"
        onScan={async (scanned) => {
          const { added, skipped } = addSerials(scanned);
          if (added === 0 && skipped > 0) {
            return { ok: false, reason: "Already added" };
          }
          return {
            ok: true,
            message: added > 0 ? `Added ${added}` : undefined,
          };
        }}
      />
    </div>
  );
}

function CreateProductInline({
  categories,
  brands,
  technologies,
  onCreated,
}: {
  categories: MasterOption[];
  brands: MasterOption[];
  technologies: MasterOption[];
  onCreated: (product: ProductOption) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [brandName, setBrandName] = useState("");
  const [technologyName, setTechnologyName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>(CapacityUnit.WP);
  const [gstRate, setGstRate] = useState("12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        brandName,
        technologyName: technologyName || undefined,
        capacity: Number(capacity),
        capacityUnit,
        gstRate: Number(gstRate),
        isActive: true,
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.message ?? "Failed to create product.");
      return;
    }
    onCreated({
      id: data.id,
      displayName: data.displayName,
      serialTracking: data.serialTracking,
      category: { name: data.category?.name ?? selectedCategory?.name ?? "Other" },
    });
  }

  const preview =
    selectedCategory && brandName && capacity
      ? generateDisplayName({
          categoryName: selectedCategory.name,
          brandName,
          technologyName: technologyName || null,
          capacity,
          capacityUnit,
        })
      : "";

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">New product</p>
      <select
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <Input
        list="opening-brand-list"
        placeholder="Brand"
        value={brandName}
        onChange={(e) => setBrandName(e.target.value)}
        className="h-11"
      />
      <datalist id="opening-brand-list">
        {brands.map((brand) => (
          <option key={brand.id} value={brand.name} />
        ))}
      </datalist>
      <Input
        list="opening-tech-list"
        placeholder="Technology (optional)"
        value={technologyName}
        onChange={(e) => setTechnologyName(e.target.value)}
        className="h-11"
      />
      <datalist id="opening-tech-list">
        {technologies.map((tech) => (
          <option key={tech.id} value={tech.name} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder="Capacity"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="h-11"
        />
        <select
          className="h-11 rounded-lg border border-slate-300 bg-white px-3"
          value={capacityUnit}
          onChange={(e) => setCapacityUnit(e.target.value as CapacityUnit)}
        >
          {CAPACITY_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        type="number"
        placeholder="GST %"
        value={gstRate}
        onChange={(e) => setGstRate(e.target.value)}
        className="h-11"
      />
      {preview ? <p className="text-xs text-slate-500">{preview}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <Button
        type="button"
        className="h-11 w-full"
        disabled={busy || !brandName || !capacity}
        onClick={() => void submit()}
      >
        Create & select
      </Button>
    </div>
  );
}
