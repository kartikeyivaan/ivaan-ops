"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { DISCOUNT_APPROVAL_THRESHOLD, getDcrPanelCharge, PROJECT_PROPOSAL_VALIDITY_DAYS } from "@/lib/project-proposal-pricing";
import { formatRevisionProposalLabel } from "@/lib/project-proposals";
import { formatDocumentDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PackageMaster = {
  id: string;
  code: string;
  name: string;
  panelWp: number;
  panelCount: number;
  systemKw: number;
  basePrice: number;
  isActive: boolean;
  isComingSoon: boolean;
};

type BrandMaster = {
  id: string;
  code: string;
  name: string;
  brandUpgradeAmount: number;
  isActive: boolean;
  isComingSoon: boolean;
};

type UpgradeMaster = {
  id: string;
  packagePanelCount: number;
  upgradeKw: number;
  label: string;
  upgradeAmount: number;
};

type PricingSummary = {
  subtotalBeforeDiscount: number;
  discountAmount: number;
  additionalCostAmount: number;
  finalAmount: number;
  subsidyEstimate: number;
  effectiveCustomerInvestment: number;
  requiresManagerApproval: boolean;
};

export type ProjectProposalFormValues = {
  customerName: string;
  customerMobile: string;
  shortAddress: string;
  proposalDate: string;
  validityDate: string;
  packageId: string;
  connectionPhase: "SINGLE_PHASE" | "THREE_PHASE";
  inverterBrandCodes: string[];
  inverterUpgradeId: string;
  structureType: "CUSTOM_FABRICATED" | "PREFAB_C_CHANNEL" | "MONO_RAIL";
  buildingType: "APARTMENT" | "BUNGALOW";
  extraFloors: string;
  futureStructurePanels: string;
  dcrAdditionalPanels: string;
  ndcrAdditionalPanels: string;
  ndcrPanelWp: string;
  discountAmount: string;
  additionalCostAmount: string;
  notes: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function packageLabel(pkg: PackageMaster) {
  return `${pkg.panelWp}+Wp × ${pkg.panelCount} panels`;
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

export function ProjectProposalForm({
  mode,
  proposalId,
  proposalNo,
  nextRevisionNo,
  initialValues,
}: {
  mode: "create" | "edit" | "revise";
  proposalId?: string;
  proposalNo?: string;
  nextRevisionNo?: number;
  initialValues?: Partial<ProjectProposalFormValues>;
}) {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageMaster[]>([]);
  const [brands, setBrands] = useState<BrandMaster[]>([]);
  const [upgrades, setUpgrades] = useState<UpgradeMaster[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);

  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? "");
  const [customerMobile, setCustomerMobile] = useState(initialValues?.customerMobile ?? "");
  const [shortAddress, setShortAddress] = useState(initialValues?.shortAddress ?? "");
  const [proposalDate, setProposalDate] = useState(
    initialValues?.proposalDate ?? todayIsoDate(),
  );
  const [packageId, setPackageId] = useState(initialValues?.packageId ?? "");
  const [connectionPhase, setConnectionPhase] = useState<"SINGLE_PHASE" | "THREE_PHASE">(
    initialValues?.connectionPhase ?? "SINGLE_PHASE",
  );
  const [inverterBrandCodes, setInverterBrandCodes] = useState<string[]>(
    initialValues?.inverterBrandCodes ?? [],
  );
  const [inverterUpgradeId, setInverterUpgradeId] = useState(
    initialValues?.inverterUpgradeId ?? "",
  );
  const [structureType, setStructureType] = useState<
    "CUSTOM_FABRICATED" | "PREFAB_C_CHANNEL" | "MONO_RAIL"
  >(initialValues?.structureType ?? "CUSTOM_FABRICATED");
  const [buildingType, setBuildingType] = useState<"APARTMENT" | "BUNGALOW">(
    initialValues?.buildingType ?? "BUNGALOW",
  );
  const [extraFloors, setExtraFloors] = useState(initialValues?.extraFloors ?? "0");
  const [futureStructurePanels, setFutureStructurePanels] = useState(
    initialValues?.futureStructurePanels ?? "0",
  );
  const [dcrAdditionalPanels, setDcrAdditionalPanels] = useState(
    initialValues?.dcrAdditionalPanels ?? "0",
  );
  const [ndcrAdditionalPanels, setNdcrAdditionalPanels] = useState(
    initialValues?.ndcrAdditionalPanels ?? "0",
  );
  const [ndcrPanelWp, setNdcrPanelWp] = useState(initialValues?.ndcrPanelWp ?? "580");
  const [discountAmount, setDiscountAmount] = useState(initialValues?.discountAmount ?? "0");
  const [additionalCostAmount, setAdditionalCostAmount] = useState(
    initialValues?.additionalCostAmount ?? "0",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");

  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const validityDate = useMemo(
    () => addDaysIsoDate(proposalDate, PROJECT_PROPOSAL_VALIDITY_DAYS),
    [proposalDate],
  );

  const selectedPackage = packages.find((pkg) => pkg.id === packageId) ?? null;
  const ndcrApplicable = (selectedPackage?.panelWp ?? 0) >= 570;
  const dcrApplicable = (selectedPackage?.panelWp ?? 0) >= 530;
  const dcrPanelCharge = selectedPackage ? getDcrPanelCharge(selectedPackage.panelWp) : 0;

  const applicableUpgrades = useMemo(() => {
    if (!selectedPackage) return [];
    return upgrades.filter(
      (upgrade) => upgrade.packagePanelCount === selectedPackage.panelCount,
    );
  }, [selectedPackage, upgrades]);

  useEffect(() => {
    async function loadMasters() {
      setMastersLoading(true);
      const response = await fetch("/api/project-proposals/masters");
      const data = await response.json();
      setMastersLoading(false);

      if (!response.ok) {
        setError(data.message ?? "Failed to load proposal masters.");
        return;
      }

      setPackages(data.packages);
      setBrands(data.brands);
      setUpgrades(data.upgrades);

      if (mode === "create" && !packageId) {
        const firstActive = data.packages.find(
          (pkg: PackageMaster) => pkg.isActive && !pkg.isComingSoon,
        );
        if (firstActive) {
          setPackageId(firstActive.id);
        }
      }

      if (mode === "create" && inverterBrandCodes.length === 0) {
        const defaults = data.brands
          .filter((brand: BrandMaster) => brand.isActive && !brand.isComingSoon)
          .filter((brand: BrandMaster) => brand.code === "POLYCAB" || brand.code === "DEYE")
          .map((brand: BrandMaster) => brand.code);
        if (defaults.length > 0) {
          setInverterBrandCodes(defaults);
        }
      }
    }

    void loadMasters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPackage || !packageId || inverterBrandCodes.length === 0) {
      setPricing(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setPricingLoading(true);
      setPricingError(null);

      const response = await fetch("/api/project-proposals/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          connectionPhase,
          inverterBrandCodes,
          inverterUpgradeId: inverterUpgradeId || null,
          structureType,
          buildingType,
          extraFloors: Number(extraFloors) || 0,
          futureStructurePanels: Number(futureStructurePanels) || 0,
          dcrAdditionalPanels: dcrApplicable ? Number(dcrAdditionalPanels) || 0 : 0,
          ndcrAdditionalPanels: ndcrApplicable ? Number(ndcrAdditionalPanels) || 0 : 0,
          ndcrPanelWp: ndcrApplicable ? Number(ndcrPanelWp) || 580 : 580,
          discountAmount: Number(discountAmount) || 0,
          additionalCostAmount: Number(additionalCostAmount) || 0,
        }),
      });

      const data = await response.json();
      setPricingLoading(false);

      if (!response.ok) {
        setPricing(null);
        setPricingError(data.message ?? "Unable to calculate pricing.");
        return;
      }

      const breakdown = data.pricing;
      setPricing({
        subtotalBeforeDiscount: breakdown.subtotalBeforeDiscount,
        discountAmount: breakdown.discountAmount,
        additionalCostAmount: breakdown.additionalCostAmount,
        finalAmount: breakdown.finalAmount,
        subsidyEstimate: breakdown.subsidyEstimate,
        effectiveCustomerInvestment: breakdown.effectiveCustomerInvestment,
        requiresManagerApproval: breakdown.requiresManagerApproval,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    packageId,
    connectionPhase,
    inverterBrandCodes,
    inverterUpgradeId,
    structureType,
    buildingType,
    extraFloors,
    futureStructurePanels,
    dcrAdditionalPanels,
    ndcrAdditionalPanels,
    ndcrPanelWp,
    discountAmount,
    additionalCostAmount,
    ndcrApplicable,
    dcrApplicable,
    selectedPackage,
  ]);

  useEffect(() => {
    if (!applicableUpgrades.some((upgrade) => upgrade.id === inverterUpgradeId)) {
      setInverterUpgradeId("");
    }
  }, [applicableUpgrades, inverterUpgradeId]);

  useEffect(() => {
    if (!ndcrApplicable) {
      setNdcrAdditionalPanels("0");
    }
  }, [ndcrApplicable]);

  useEffect(() => {
    if (!dcrApplicable) {
      setDcrAdditionalPanels("0");
    }
  }, [dcrApplicable]);

  function toggleBrand(code: string, enabled: boolean) {
    setInverterBrandCodes((current) => {
      if (enabled) {
        return current.includes(code) ? current : [...current, code];
      }
      return current.filter((entry) => entry !== code);
    });
  }

  function buildPayload() {
    return {
      customerName: customerName.trim(),
      customerMobile: customerMobile.trim(),
      shortAddress: shortAddress.trim() || "—",
      proposalDate,
      packageId,
      connectionPhase,
      inverterBrandCodes,
      inverterUpgradeId: inverterUpgradeId || null,
      structureType,
      buildingType,
      extraFloors: Number(extraFloors) || 0,
      futureStructurePanels: Number(futureStructurePanels) || 0,
      dcrAdditionalPanels: dcrApplicable ? Number(dcrAdditionalPanels) || 0 : 0,
      ndcrAdditionalPanels: ndcrApplicable ? Number(ndcrAdditionalPanels) || 0 : 0,
      ndcrPanelWp: ndcrApplicable ? Number(ndcrPanelWp) || 580 : 580,
      discountAmount: Number(discountAmount) || 0,
      additionalCostAmount: Number(additionalCostAmount) || 0,
      notes: notes.trim() || undefined,
    };
  }

  async function handleSave() {
    setError("");
    setSaving(true);

    const payload = buildPayload();
    const response =
      mode === "create"
        ? await fetch("/api/project-proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : mode === "revise"
          ? await fetch(`/api/project-proposals/${proposalId}/revise`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/project-proposals/${proposalId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save proposal.");
      return;
    }

    const savedId = data.proposal?.id ?? proposalId;
    if (!savedId) {
      setError("Proposal saved but could not open the detail page.");
      return;
    }

    router.replace(`/projects/proposals/${savedId}`);
  }

  return (
    <div className="space-y-6 pb-28 xl:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {mode === "create"
              ? "New Project Proposal"
              : mode === "revise"
                ? "Revise Project Proposal"
                : "Edit Project Proposal"}
          </h1>
          <p className="text-sm text-slate-500">
            {mode === "revise" && nextRevisionNo !== undefined
              ? `${proposalNo ?? "Proposal"} will become ${formatRevisionProposalLabel(nextRevisionNo)} and return to draft.`
              : "Package-based solar proposal with live pricing and 5-day validity."}
          </p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link
            href={
              mode === "edit" || mode === "revise"
                ? `/projects/proposals/${proposalId}`
                : "/projects/proposals"
            }
          >
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer & Proposal</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Customer full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerMobile">Mobile Number *</Label>
                <Input
                  id="customerMobile"
                  value={customerMobile}
                  onChange={(event) => setCustomerMobile(event.target.value)}
                  placeholder="10-digit mobile number"
                />
              </div>
              {mode === "revise" && nextRevisionNo !== undefined ? (
                <div className="space-y-2">
                  <Label htmlFor="revisionNo">New Revision</Label>
                  <Input
                    id="revisionNo"
                    value={formatRevisionProposalLabel(nextRevisionNo)}
                    readOnly
                    className="bg-slate-50"
                  />
                </div>
              ) : null}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="shortAddress">Short Address</Label>
                <Input
                  id="shortAddress"
                  value={shortAddress}
                  onChange={(event) => setShortAddress(event.target.value)}
                  placeholder="Area, city landmark or short address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposalDate">Proposal Date</Label>
                <Input
                  id="proposalDate"
                  type="date"
                  value={proposalDate}
                  onChange={(event) => setProposalDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validityDate">Validity</Label>
                <Input
                  id="validityDate"
                  value={formatDocumentDate(validityDate)}
                  readOnly
                  className="bg-slate-50"
                />
                <p className="text-xs text-slate-500">
                  Fixed at {PROJECT_PROPOSAL_VALIDITY_DAYS} days from proposal date.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="connectionPhase"
                  checked={connectionPhase === "SINGLE_PHASE"}
                  onChange={() => setConnectionPhase("SINGLE_PHASE")}
                />
                Single Phase
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="connectionPhase"
                  checked={connectionPhase === "THREE_PHASE"}
                  onChange={() => setConnectionPhase("THREE_PHASE")}
                />
                Three Phase (+₹25,000)
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Package</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {mastersLoading ? (
                <p className="text-sm text-slate-500">Loading packages…</p>
              ) : (
                packages.map((pkg) => {
                  const disabled = !pkg.isActive || pkg.isComingSoon;
                  return (
                    <label
                      key={pkg.id}
                      className={`rounded-lg border p-4 text-sm ${
                        packageId === pkg.id
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200"
                      } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="packageId"
                          checked={packageId === pkg.id}
                          disabled={disabled}
                          onChange={() => setPackageId(pkg.id)}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium text-slate-900">{packageLabel(pkg)}</p>
                          <p className="text-slate-600">{pkg.name}</p>
                          <p className="mt-1 text-slate-500">
                            {pkg.systemKw} kW · {formatMoney(pkg.basePrice)}
                          </p>
                          {pkg.isComingSoon ? (
                            <p className="mt-1 text-xs font-medium text-amber-700">Coming Soon</p>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inverter Brands</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {brands.map((brand) => {
                const disabled = !brand.isActive || brand.isComingSoon;
                const checked = inverterBrandCodes.includes(brand.code);
                return (
                  <label
                    key={brand.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                      disabled ? "opacity-60" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => toggleBrand(brand.code, event.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-slate-900">{brand.name}</p>
                      {brand.brandUpgradeAmount > 0 ? (
                        <p className="text-slate-500">+₹5,000 upgrade once if selected</p>
                      ) : null}
                      {brand.isComingSoon ? (
                        <p className="text-xs font-medium text-amber-700">Coming Soon</p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inverter Upgrade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="inverterUpgradeId">Upgrade option</Label>
              <select
                id="inverterUpgradeId"
                value={inverterUpgradeId}
                onChange={(event) => setInverterUpgradeId(event.target.value)}
                className={selectClassName}
                disabled={!selectedPackage}
              >
                <option value="">No upgrade</option>
                {applicableUpgrades.map((upgrade) => (
                  <option key={upgrade.id} value={upgrade.id}>
                    {upgrade.label} (+{formatMoney(upgrade.upgradeAmount)})
                  </option>
                ))}
              </select>
              {!selectedPackage ? (
                <p className="text-xs text-slate-500">Select a package to see upgrade options.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Structure & Building</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="radio"
                    name="structureType"
                    checked={structureType === "CUSTOM_FABRICATED"}
                    onChange={() => setStructureType("CUSTOM_FABRICATED")}
                  />
                  Custom Fabricated
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="radio"
                    name="structureType"
                    checked={structureType === "PREFAB_C_CHANNEL"}
                    onChange={() => setStructureType("PREFAB_C_CHANNEL")}
                  />
                  Pre-fabricated C Channel
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="radio"
                    name="structureType"
                    checked={structureType === "MONO_RAIL"}
                    onChange={() => setStructureType("MONO_RAIL")}
                  />
                  Mono Rail Structure
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="buildingType">Building Type</Label>
                  <select
                    id="buildingType"
                    value={buildingType}
                    onChange={(event) =>
                      setBuildingType(event.target.value as "APARTMENT" | "BUNGALOW")
                    }
                    className={selectClassName}
                  >
                    <option value="BUNGALOW">Bungalow</option>
                    <option value="APARTMENT">Apartment</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extraFloors">Floors above 2</Label>
                  <Input
                    id="extraFloors"
                    type="number"
                    min={0}
                    value={extraFloors}
                    onChange={(event) => setExtraFloors(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">₹2,000 per additional floor above 2.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add-ons</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="futureStructurePanels">Future Structure Provision Panels</Label>
                <Input
                  id="futureStructurePanels"
                  type="number"
                  min={0}
                  value={futureStructurePanels}
                  onChange={(event) => setFutureStructurePanels(event.target.value)}
                />
                <p className="text-xs text-slate-500">₹3,000 per additional future panel.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dcrAdditionalPanels">Additional DCR Panels</Label>
                <Input
                  id="dcrAdditionalPanels"
                  type="number"
                  min={0}
                  value={dcrAdditionalPanels}
                  onChange={(event) => setDcrAdditionalPanels(event.target.value)}
                  disabled={!dcrApplicable}
                />
                <p className="text-xs text-slate-500">
                  {dcrApplicable
                    ? dcrPanelCharge === 17_000
                      ? "₹17,000 per additional DCR panel for 570+Wp packages."
                      : "₹15,000 per additional DCR panel for 530+Wp packages."
                    : "Available only for 530+Wp packages."}
                </p>
              </div>
              {dcrApplicable && Number(dcrAdditionalPanels) > 0 && selectedPackage ? (
                <div className="space-y-2">
                  <Label htmlFor="dcrPanelWp">DCR Panel Rating (Wp)</Label>
                  <Input
                    id="dcrPanelWp"
                    value={`${selectedPackage.panelWp}+`}
                    readOnly
                    className="bg-slate-50"
                  />
                  <p className="text-xs text-slate-500">
                    Same as selected package ({selectedPackage.panelWp}+ Wp).
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="ndcrAdditionalPanels">Additional NDCR Panels</Label>
                <Input
                  id="ndcrAdditionalPanels"
                  type="number"
                  min={0}
                  value={ndcrAdditionalPanels}
                  onChange={(event) => setNdcrAdditionalPanels(event.target.value)}
                  disabled={!ndcrApplicable}
                />
                <p className="text-xs text-slate-500">
                  {ndcrApplicable
                    ? "₹11,500 per additional NDCR panel for 570+Wp packages."
                    : "Available only for 570+Wp packages."}
                </p>
              </div>
              {ndcrApplicable && Number(ndcrAdditionalPanels) > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="ndcrPanelWp">NDCR Panel Rating (Wp)</Label>
                  <Input
                    id="ndcrPanelWp"
                    type="number"
                    min={570}
                    max={650}
                    value={ndcrPanelWp}
                    onChange={(event) => setNdcrPanelWp(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">Default 580+ Wp; shown separately from DCR panels on proposal PDF.</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Optional notes for this proposal"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discountAmount">Discount</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  min={0}
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalCostAmount">Additional Cost</Label>
                <Input
                  id="additionalCostAmount"
                  type="number"
                  min={0}
                  value={additionalCostAmount}
                  onChange={(event) => setAdditionalCostAmount(event.target.value)}
                />
              </div>

              {pricing?.requiresManagerApproval ? (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Discount above ₹{DISCOUNT_APPROVAL_THRESHOLD.toLocaleString("en-IN")} requires
                  manager approval before sending.
                </div>
              ) : null}

              {pricingError ? (
                <p className="text-sm text-red-600">{pricingError}</p>
              ) : null}

              <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Tentative amount</span>
                  <span className="font-medium text-slate-900">
                    {pricing ? formatMoney(pricing.subtotalBeforeDiscount) : pricingLoading ? "…" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-slate-900">
                    {pricing ? formatMoney(pricing.discountAmount) : pricingLoading ? "…" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Additional cost</span>
                  <span className="font-medium text-slate-900">
                    {pricing ? formatMoney(pricing.additionalCostAmount) : pricingLoading ? "…" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="font-medium text-slate-900">Final amount</span>
                  <span className="text-lg font-semibold text-emerald-700">
                    {pricing ? formatMoney(pricing.finalAmount) : pricingLoading ? "…" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Estimated subsidy</span>
                  <span className="font-medium text-slate-900">
                    {pricing ? formatMoney(pricing.subsidyEstimate) : pricingLoading ? "…" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Effective customer investment</span>
                  <span className="font-medium text-slate-900">
                    {pricing
                      ? formatMoney(pricing.effectiveCustomerInvestment)
                      : pricingLoading
                        ? "…"
                        : "—"}
                  </span>
                </div>
              </div>

              <Button
                className="hidden w-full xl:flex"
                onClick={() => void handleSave()}
                disabled={saving || mastersLoading || !customerName.trim() || !customerMobile.trim()}
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Saving…"
                  : mode === "create"
                    ? "Save Draft"
                    : mode === "revise"
                      ? "Save Revision Draft"
                      : "Update Draft"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 xl:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Final amount</p>
            <p className="truncate text-lg font-semibold text-emerald-700">
              {pricing ? formatMoney(pricing.finalAmount) : pricingLoading ? "…" : "—"}
            </p>
          </div>
          <Button
            className="shrink-0"
            onClick={() => void handleSave()}
            disabled={saving || mastersLoading || !customerName.trim() || !customerMobile.trim()}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
