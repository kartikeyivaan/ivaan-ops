"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseApiJson } from "@/lib/api-response";
import { PROPOSAL_PACKAGE_TYPE_LABELS } from "@/lib/project-proposal-packages";
import { ProposalPackageType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ModuleProduct = {
  id: string;
  displayName: string;
  capacity: number;
  capacityUnit: string;
};

type PackageRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  packageType: ProposalPackageType;
  panelWp: number;
  panelCount: number;
  systemKw: number;
  defaultInverterBrands: string[];
  basePrice: number;
  dcrAdditionalPanelRate: number | null;
  ndcrAdditionalPanelRate: number | null;
  futureStructurePanelRate: number | null;
  moduleSegmentLabel: string | null;
  hybridBasePrice: number | null;
  hybridPerInverterKwRate: number | null;
  hybridPerBatteryUnitRate: number | null;
  batteryUnitKwh: number | null;
  isActive: boolean;
  isComingSoon: boolean;
  sortOrder: number;
  moduleOptions: {
    productId: string;
    isDefault: boolean;
    product: ModuleProduct;
  }[];
  inverterUpgrades: {
    id: string;
    upgradeKw: number;
    label: string;
    upgradeAmount: number;
    isActive: boolean;
    sortOrder: number;
  }[];
};

type InverterUpgradeFormRow = {
  upgradeKw: string;
  label: string;
  upgradeAmount: string;
};

const emptyForm = {
  code: "",
  name: "",
  description: "",
  packageType: ProposalPackageType.SUBSIDY_DCR as ProposalPackageType,
  panelWp: "530",
  panelCount: "6",
  systemKw: "3.3",
  defaultInverterBrands: "Polycab,Deye",
  basePrice: "0",
  dcrAdditionalPanelRate: "",
  ndcrAdditionalPanelRate: "",
  futureStructurePanelRate: "",
  moduleSegmentLabel: "",
  hybridBasePrice: "",
  hybridPerInverterKwRate: "",
  hybridPerBatteryUnitRate: "",
  batteryUnitKwh: "5",
  isActive: true,
  isComingSoon: false,
  sortOrder: "0",
  moduleProductIds: [] as string[],
  defaultModuleProductId: "",
  inverterUpgrades: [] as InverterUpgradeFormRow[],
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function ProposalPackagesAdmin() {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [moduleProducts, setModuleProducts] = useState<ModuleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [packagesRes, modulesRes] = await Promise.all([
      fetch("/api/admin/proposal-packages"),
      fetch("/api/admin/proposal-packages/module-products"),
    ]);
    const packagesData = await parseApiJson<{ packages?: PackageRecord[]; message?: string }>(
      packagesRes,
    );
    const modulesData = await parseApiJson<{ products?: ModuleProduct[] }>(modulesRes);
    setLoading(false);

    if (!packagesRes.ok) {
      setError(packagesData.message ?? "Failed to load packages.");
      return;
    }

    setPackages(packagesData.packages ?? []);
    setModuleProducts(modulesData.products ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editingPackage = useMemo(
    () => packages.find((pkg) => pkg.id === editingId) ?? null,
    [editingId, packages],
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    setError(null);
    setMessage(null);
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(pkg: PackageRecord) {
    setError(null);
    setMessage(null);
    setEditingId(pkg.id);
    setForm({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description ?? "",
      packageType: pkg.packageType,
      panelWp: String(pkg.panelWp),
      panelCount: String(pkg.panelCount),
      systemKw: String(pkg.systemKw),
      defaultInverterBrands: pkg.defaultInverterBrands.join(","),
      basePrice: String(pkg.basePrice),
      dcrAdditionalPanelRate:
        pkg.dcrAdditionalPanelRate != null ? String(pkg.dcrAdditionalPanelRate) : "",
      ndcrAdditionalPanelRate:
        pkg.ndcrAdditionalPanelRate != null ? String(pkg.ndcrAdditionalPanelRate) : "",
      futureStructurePanelRate:
        pkg.futureStructurePanelRate != null ? String(pkg.futureStructurePanelRate) : "",
      moduleSegmentLabel: pkg.moduleSegmentLabel ?? "",
      hybridBasePrice: pkg.hybridBasePrice != null ? String(pkg.hybridBasePrice) : "",
      hybridPerInverterKwRate:
        pkg.hybridPerInverterKwRate != null ? String(pkg.hybridPerInverterKwRate) : "",
      hybridPerBatteryUnitRate:
        pkg.hybridPerBatteryUnitRate != null ? String(pkg.hybridPerBatteryUnitRate) : "",
      batteryUnitKwh: pkg.batteryUnitKwh != null ? String(pkg.batteryUnitKwh) : "5",
      isActive: pkg.isActive,
      isComingSoon: pkg.isComingSoon,
      sortOrder: String(pkg.sortOrder),
      moduleProductIds: pkg.moduleOptions.map((option) => option.productId),
      defaultModuleProductId:
        pkg.moduleOptions.find((option) => option.isDefault)?.productId ??
        pkg.moduleOptions[0]?.productId ??
        "",
      inverterUpgrades: pkg.inverterUpgrades.map((upgrade) => ({
        upgradeKw: String(upgrade.upgradeKw),
        label: upgrade.label,
        upgradeAmount: String(upgrade.upgradeAmount),
      })),
    });
    setShowForm(true);
  }

  function toggleModuleProduct(productId: string, checked: boolean) {
    setForm((current) => {
      const ids = checked
        ? [...current.moduleProductIds, productId]
        : current.moduleProductIds.filter((id) => id !== productId);
      const defaultModuleProductId =
        ids.includes(current.defaultModuleProductId) && current.defaultModuleProductId
          ? current.defaultModuleProductId
          : ids[0] ?? "";
      return { ...current, moduleProductIds: ids, defaultModuleProductId };
    });
  }

  function buildPayload() {
    const parseOptional = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return Number(trimmed);
    };

    return {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      packageType: form.packageType,
      panelWp: Number(form.panelWp) || 0,
      panelCount: Number(form.panelCount) || 0,
      systemKw: Number(form.systemKw) || 0,
      defaultInverterBrands: form.defaultInverterBrands
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      basePrice: Number(form.basePrice) || 0,
      dcrAdditionalPanelRate: parseOptional(form.dcrAdditionalPanelRate),
      ndcrAdditionalPanelRate: parseOptional(form.ndcrAdditionalPanelRate),
      futureStructurePanelRate: parseOptional(form.futureStructurePanelRate),
      moduleSegmentLabel: form.moduleSegmentLabel.trim() || null,
      hybridBasePrice: parseOptional(form.hybridBasePrice),
      hybridPerInverterKwRate: parseOptional(form.hybridPerInverterKwRate),
      hybridPerBatteryUnitRate: parseOptional(form.hybridPerBatteryUnitRate),
      batteryUnitKwh: parseOptional(form.batteryUnitKwh),
      isActive: form.isActive,
      isComingSoon: form.isComingSoon,
      sortOrder: Number(form.sortOrder) || 0,
      moduleOptions: form.moduleProductIds.map((productId, index) => ({
        productId,
        isDefault: productId === form.defaultModuleProductId,
        sortOrder: index,
      })),
      inverterUpgrades: form.inverterUpgrades
        .filter((row) => row.label.trim() && row.upgradeKw.trim())
        .map((row, index) => ({
          upgradeKw: Number(row.upgradeKw) || 0,
          label: row.label.trim(),
          upgradeAmount: Number(row.upgradeAmount) || 0,
          sortOrder: index,
        })),
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = buildPayload();
    const response = await fetch(
      editingId ? `/api/admin/proposal-packages/${editingId}` : "/api/admin/proposal-packages",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await parseApiJson<{ message?: string }>(response);
    setSaving(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to save package.");
      return;
    }

    setMessage(editingId ? "Package updated." : "Package created.");
    resetForm();
    await load();
    router.refresh();
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm("Deactivate this package? Existing proposals are unchanged.")) return;
    setError(null);
    const response = await fetch(`/api/admin/proposal-packages/${id}`, { method: "DELETE" });
    const data = await parseApiJson<{ message?: string }>(response);
    if (!response.ok) {
      setError(data.message ?? "Failed to deactivate package.");
      return;
    }
    setMessage("Package deactivated.");
    if (editingId === id) resetForm();
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={startCreate}>
          New package
        </Button>
        {showForm ? (
          <Button type="button" variant="outline" onClick={resetForm}>
            Cancel
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingPackage ? `Edit ${editingPackage.code}` : "New package"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                disabled={editingPackage?.code === "NDCR_COMPLETE"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packageType">Type</Label>
              <select
                id="packageType"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={form.packageType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    packageType: event.target.value as ProposalPackageType,
                  })
                }
              >
                {Object.entries(PROPOSAL_PACKAGE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panelWp">Panel Wp (segment)</Label>
              <Input
                id="panelWp"
                type="number"
                value={form.panelWp}
                onChange={(event) => setForm({ ...form, panelWp: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panelCount">Panel count</Label>
              <Input
                id="panelCount"
                type="number"
                value={form.panelCount}
                onChange={(event) => setForm({ ...form, panelCount: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemKw">System kW</Label>
              <Input
                id="systemKw"
                value={form.systemKw}
                onChange={(event) => setForm({ ...form, systemKw: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basePrice">Base price</Label>
              <Input
                id="basePrice"
                type="number"
                value={form.basePrice}
                onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="defaultInverterBrands">Default inverter brands (comma-separated)</Label>
              <Input
                id="defaultInverterBrands"
                value={form.defaultInverterBrands}
                onChange={(event) =>
                  setForm({ ...form, defaultInverterBrands: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dcrAdditionalPanelRate">Additional DCR panel rate</Label>
              <Input
                id="dcrAdditionalPanelRate"
                type="number"
                placeholder="Leave blank for default by Wp"
                value={form.dcrAdditionalPanelRate}
                onChange={(event) =>
                  setForm({ ...form, dcrAdditionalPanelRate: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="futureStructurePanelRate">Future structure rate / panel</Label>
              <Input
                id="futureStructurePanelRate"
                type="number"
                placeholder="Default 3000"
                value={form.futureStructurePanelRate}
                onChange={(event) =>
                  setForm({ ...form, futureStructurePanelRate: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="moduleSegmentLabel">Module segment label</Label>
              <Input
                id="moduleSegmentLabel"
                placeholder="e.g. Waaree Mono 530+ Wp segment"
                value={form.moduleSegmentLabel}
                onChange={(event) =>
                  setForm({ ...form, moduleSegmentLabel: event.target.value })
                }
              />
            </div>
            {form.packageType === ProposalPackageType.HYBRID ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="hybridBasePrice">Hybrid base price</Label>
                  <Input
                    id="hybridBasePrice"
                    type="number"
                    value={form.hybridBasePrice}
                    onChange={(event) =>
                      setForm({ ...form, hybridBasePrice: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hybridPerInverterKwRate">Per inverter kW rate</Label>
                  <Input
                    id="hybridPerInverterKwRate"
                    type="number"
                    value={form.hybridPerInverterKwRate}
                    onChange={(event) =>
                      setForm({ ...form, hybridPerInverterKwRate: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hybridPerBatteryUnitRate">Per battery unit rate</Label>
                  <Input
                    id="hybridPerBatteryUnitRate"
                    type="number"
                    value={form.hybridPerBatteryUnitRate}
                    onChange={(event) =>
                      setForm({ ...form, hybridPerBatteryUnitRate: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batteryUnitKwh">Battery unit size (kWh)</Label>
                  <Input
                    id="batteryUnitKwh"
                    type="number"
                    value={form.batteryUnitKwh}
                    onChange={(event) =>
                      setForm({ ...form, batteryUnitKwh: event.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isComingSoon}
                  onChange={(event) => setForm({ ...form, isComingSoon: event.target.checked })}
                />
                Coming soon
              </label>
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Package inverter upgrades</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      ...form,
                      inverterUpgrades: [
                        ...form.inverterUpgrades,
                        { upgradeKw: "", label: "", upgradeAmount: "" },
                      ],
                    })
                  }
                >
                  Add upgrade
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Overrides global upgrades for this package on the proposal form. Leave empty to use
                shared upgrades by panel count only.
              </p>
              {form.inverterUpgrades.map((row, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-4">
                  <Input
                    placeholder="kW"
                    value={row.upgradeKw}
                    onChange={(event) => {
                      const next = [...form.inverterUpgrades];
                      next[index] = { ...row, upgradeKw: event.target.value };
                      setForm({ ...form, inverterUpgrades: next });
                    }}
                  />
                  <Input
                    placeholder="Label"
                    className="md:col-span-2"
                    value={row.label}
                    onChange={(event) => {
                      const next = [...form.inverterUpgrades];
                      next[index] = { ...row, label: event.target.value };
                      setForm({ ...form, inverterUpgrades: next });
                    }}
                  />
                  <Input
                    placeholder="Amount ₹"
                    value={row.upgradeAmount}
                    onChange={(event) => {
                      const next = [...form.inverterUpgrades];
                      next[index] = { ...row, upgradeAmount: event.target.value };
                      setForm({ ...form, inverterUpgrades: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Module alternates (from product master)</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-3 space-y-2">
                {moduleProducts.length === 0 ? (
                  <p className="text-sm text-slate-500">No module products found.</p>
                ) : (
                  moduleProducts.map((product) => {
                    const checked = form.moduleProductIds.includes(product.id);
                    return (
                      <label key={product.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleModuleProduct(product.id, event.target.checked)
                          }
                        />
                        <span>
                          {product.displayName} ({product.capacity} {product.capacityUnit})
                        </span>
                        {checked ? (
                          <input
                            type="radio"
                            name="defaultModule"
                            checked={form.defaultModuleProductId === product.id}
                            onChange={() =>
                              setForm({ ...form, defaultModuleProductId: product.id })
                            }
                            title="Default module"
                          />
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-slate-500">
                Select alternates for this package. The selected radio is the default on new
                proposals.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update package" : "Create package"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All packages</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.code}</TableCell>
                    <TableCell>{PROPOSAL_PACKAGE_TYPE_LABELS[pkg.packageType]}</TableCell>
                    <TableCell>
                      {pkg.panelCount > 0
                        ? `${pkg.panelWp}+ Wp × ${pkg.panelCount} · ${pkg.systemKw} kW`
                        : pkg.packageType === ProposalPackageType.HYBRID
                          ? "Hybrid"
                          : "Custom"}
                    </TableCell>
                    <TableCell>{money(pkg.basePrice)}</TableCell>
                    <TableCell>{pkg.moduleOptions.length || "—"}</TableCell>
                    <TableCell>
                      {!pkg.isActive ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : pkg.isComingSoon ? (
                        <Badge variant="outline">Coming soon</Badge>
                      ) : (
                        <Badge>Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(pkg)}>
                        Edit
                      </Button>
                      {pkg.isActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDeactivate(pkg.id)}
                        >
                          Deactivate
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        Packages configured here feed the proposal form under{" "}
        <Link href="/projects/proposals" className="text-emerald-700 underline">
          Projects → Proposals
        </Link>
        . Existing proposals stay as saved; price changes apply only on new saves.
      </p>
    </div>
  );
}
