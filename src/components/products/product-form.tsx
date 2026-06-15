"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAPACITY_UNITS, generateDisplayName } from "@/lib/products";
import { CapacityUnit } from "@prisma/client";

type MasterOption = { id: string; name: string };

export function ProductForm({
  mode,
  productId,
  categories,
  brands,
  technologies,
  canManagePricing,
  initialValues,
}: {
  mode: "create" | "edit";
  productId?: string;
  categories: MasterOption[];
  brands: MasterOption[];
  technologies: MasterOption[];
  canManagePricing: boolean;
  initialValues?: {
    categoryId: string;
    brandName: string;
    technologyName: string;
    capacity: string;
    capacityUnit: CapacityUnit;
    hsn: string;
    gstRate: string;
    isActive: boolean;
  };
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? "");
  const [brandName, setBrandName] = useState(initialValues?.brandName ?? "");
  const [technologyName, setTechnologyName] = useState(initialValues?.technologyName ?? "");
  const [capacity, setCapacity] = useState(initialValues?.capacity ?? "");
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>(
    initialValues?.capacityUnit ?? CapacityUnit.WP,
  );
  const [hsn, setHsn] = useState(initialValues?.hsn ?? "");
  const [gstRate, setGstRate] = useState(initialValues?.gstRate ?? "12");
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [landingCost, setLandingCost] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const previewName = useMemo(() => {
    if (!selectedCategory || !brandName || !capacity) return "";
    return generateDisplayName({
      categoryName: selectedCategory.name,
      brandName,
      technologyName: technologyName || null,
      capacity,
      capacityUnit,
    });
  }, [selectedCategory, brandName, technologyName, capacity, capacityUnit]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      categoryId,
      brandName,
      technologyName: technologyName || undefined,
      capacity: Number(capacity),
      capacityUnit,
      hsn: hsn || undefined,
      gstRate: Number(gstRate),
      isActive,
    };

    if (mode === "create" && canManagePricing && standardPrice) {
      payload.initialPrice = {
        landingCost: Number(landingCost || 0),
        standardPrice: Number(standardPrice),
        minimumPrice: Number(minimumPrice || 0),
      };
    }

    const response = await fetch(
      mode === "create" ? "/api/products" : `/api/products/${productId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to save product.");
      return;
    }

    router.push(`/masters/products/${data.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Create Product" : "Edit Product"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandName">Brand</Label>
            <Input
              id="brandName"
              list="brand-options"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              required
            />
            <datalist id="brand-options">
              {brands.map((brand) => (
                <option key={brand.id} value={brand.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="technologyName">Technology</Label>
            <Input
              id="technologyName"
              list="technology-options"
              value={technologyName}
              onChange={(e) => setTechnologyName(e.target.value)}
            />
            <datalist id="technology-options">
              {technologies.map((technology) => (
                <option key={technology.id} value={technology.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              step="0.001"
              min="0"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacityUnit">Unit</Label>
            <select
              id="capacityUnit"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
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
          <div className="space-y-2">
            <Label htmlFor="hsn">HSN</Label>
            <Input id="hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstRate">GST Rate (%)</Label>
            <Input
              id="gstRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              required
            />
          </div>
          {mode === "edit" ? (
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <select
                id="isActive"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          ) : null}
          {previewName ? (
            <div className="md:col-span-2 rounded-md bg-slate-50 p-3 text-sm">
              <span className="font-medium text-slate-700">Generated name: </span>
              {previewName}
            </div>
          ) : null}

          {mode === "create" && canManagePricing ? (
            <>
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-slate-700">Initial company price (optional)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="landingCost">Landing Cost</Label>
                <Input
                  id="landingCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={landingCost}
                  onChange={(e) => setLandingCost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="standardPrice">Standard Price</Label>
                <Input
                  id="standardPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={standardPrice}
                  onChange={(e) => setStandardPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumPrice">Minimum Price</Label>
                <Input
                  id="minimumPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={minimumPrice}
                  onChange={(e) => setMinimumPrice(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : mode === "create" ? "Create product" : "Save changes"}
            </Button>
            {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
