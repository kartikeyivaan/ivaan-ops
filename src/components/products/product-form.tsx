"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAPACITY_UNITS,
  generateDisplayName,
  isKitCategory,
  type KitBomLineForName,
} from "@/lib/products";
import { CapacityUnit } from "@prisma/client";

type MasterOption = { id: string; name: string };

type KitLineDraft = {
  key: string;
  productId: string;
  productName: string;
  categoryName: string;
  brandName: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  qty: string;
};

type ComponentProductOption = {
  id: string;
  displayName: string;
  category: { name: string };
  brand: { name: string };
  capacity: number;
  capacityUnit: CapacityUnit;
};

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
    kitComponents?: Array<{
      productId: string;
      productName: string;
      categoryName: string;
      brandName: string;
      capacity: number;
      capacityUnit: CapacityUnit;
      qty: number;
    }>;
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
  const [kitLines, setKitLines] = useState<KitLineDraft[]>(() =>
    (initialValues?.kitComponents ?? []).map((line, index) => ({
      key: `init-${index}-${line.productId}`,
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      brandName: line.brandName,
      capacity: line.capacity,
      capacityUnit: line.capacityUnit,
      qty: String(line.qty),
    })),
  );
  const [componentOptions, setComponentOptions] = useState<ComponentProductOption[]>([]);
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerQty, setPickerQty] = useState("1");

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const isKit = selectedCategory ? isKitCategory(selectedCategory.name) : false;

  useEffect(() => {
    if (!isKit) return;
    let cancelled = false;
    fetch("/api/products?isActive=true")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setComponentOptions(
          data
            .filter(
              (product: { isKit?: boolean; category?: { name: string } }) =>
                !product.isKit && product.category?.name !== "Kit",
            )
            .map(
              (product: {
                id: string;
                displayName: string;
                category: { name: string };
                brand: { name: string };
                capacity: number;
                capacityUnit: CapacityUnit;
              }) => ({
                id: product.id,
                displayName: product.displayName,
                category: product.category,
                brand: product.brand,
                capacity: product.capacity,
                capacityUnit: product.capacityUnit,
              }),
            ),
        );
      })
      .catch(() => {
        if (!cancelled) setComponentOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isKit]);

  const kitNameLines: KitBomLineForName[] = useMemo(
    () =>
      kitLines
        .filter((line) => line.productId && Number(line.qty) > 0)
        .map((line) => ({
          categoryName: line.categoryName,
          brandName: line.brandName,
          capacity: line.capacity,
          capacityUnit: line.capacityUnit,
          qty: Number(line.qty),
        })),
    [kitLines],
  );

  const previewName = useMemo(() => {
    if (!selectedCategory) return "";
    if (isKit) {
      if (kitNameLines.length === 0) return "";
      return generateDisplayName({
        categoryName: selectedCategory.name,
        brandName: "Ivaan",
        capacity: 1,
        capacityUnit: CapacityUnit.KW,
        kitComponents: kitNameLines,
      });
    }
    if (!brandName || !capacity) return "";
    return generateDisplayName({
      categoryName: selectedCategory.name,
      brandName,
      technologyName: technologyName || null,
      capacity,
      capacityUnit,
    });
  }, [selectedCategory, isKit, kitNameLines, brandName, technologyName, capacity, capacityUnit]);

  function addKitLine() {
    const product = componentOptions.find((option) => option.id === pickerProductId);
    if (!product) {
      setMessage("Select an existing product to add.");
      return;
    }
    if (kitLines.some((line) => line.productId === product.id)) {
      setMessage("That product is already in the kit.");
      return;
    }
    const qty = Number(pickerQty);
    if (!(qty > 0)) {
      setMessage("Component quantity must be greater than zero.");
      return;
    }
    setMessage(null);
    setKitLines((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        productName: product.displayName,
        categoryName: product.category.name,
        brandName: product.brand.name,
        capacity: product.capacity,
        capacityUnit: product.capacityUnit,
        qty: String(qty),
      },
    ]);
    setPickerProductId("");
    setPickerQty("1");
  }

  function removeKitLine(key: string) {
    setKitLines((current) => current.filter((line) => line.key !== key));
  }

  function updateKitLineQty(key: string, qty: string) {
    setKitLines((current) =>
      current.map((line) => (line.key === key ? { ...line, qty } : line)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (isKit && kitLines.length === 0) {
      setLoading(false);
      setMessage("Add at least one component product to the kit.");
      return;
    }

    const payload: Record<string, unknown> = {
      categoryId,
      hsn: hsn || undefined,
      gstRate: Number(gstRate),
      isActive,
    };

    if (isKit) {
      payload.kitComponents = kitLines.map((line) => ({
        productId: line.productId,
        qty: Number(line.qty),
      }));
    } else {
      payload.brandName = brandName;
      payload.technologyName = technologyName || undefined;
      payload.capacity = Number(capacity);
      payload.capacityUnit = capacityUnit;
    }

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
              onChange={(e) => {
                setCategoryId(e.target.value);
                setMessage(null);
              }}
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {!isKit ? (
            <>
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
            </>
          ) : null}

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

          {isKit ? (
            <div className="md:col-span-2 space-y-3 rounded-md border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Kit components</p>
                <p className="text-xs text-slate-500">
                  Add existing products and quantities. Name is generated from the BOM.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="kitProduct">Product</Label>
                  <select
                    id="kitProduct"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={pickerProductId}
                    onChange={(e) => setPickerProductId(e.target.value)}
                  >
                    <option value="">Select product…</option>
                    {componentOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kitQty">Qty</Label>
                  <Input
                    id="kitQty"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={pickerQty}
                    onChange={(e) => setPickerQty(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={addKitLine}>
                    Add line
                  </Button>
                </div>
              </div>

              {kitLines.length > 0 ? (
                <div className="space-y-2">
                  {kitLines.map((line) => (
                    <div
                      key={line.key}
                      className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_120px_auto]"
                    >
                      <div className="text-sm text-slate-800">{line.productName}</div>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.qty}
                        onChange={(e) => updateKitLineQty(line.key, e.target.value)}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeKitLine(line.key)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No components added yet.</p>
              )}
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
                <p className="text-sm font-medium text-slate-700">
                  {isKit ? "Kit sell price (optional)" : "Initial company price (optional)"}
                </p>
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
