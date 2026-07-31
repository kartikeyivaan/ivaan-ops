"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductForm } from "@/components/products/product-form";
import {
  formatCapacityUnit,
  formatPricingType,
} from "@/lib/products";
import type { ProductListItem } from "@/lib/product-service";
import { formatDate } from "@/lib/utils";

type MasterOption = { id: string; name: string };

export function ProductProfile({
  product,
  categories,
  brands,
  technologies,
  canEdit,
  canManagePricing,
}: {
  product: ProductListItem;
  categories: MasterOption[];
  brands: MasterOption[];
  technologies: MasterOption[];
  canEdit: boolean;
  canManagePricing: boolean;
}) {
  const router = useRouter();
  const [landingCost, setLandingCost] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const priceHistory = product.prices;

  async function handleAddPrice(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setPriceMessage(null);

    const response = await fetch(`/api/products/${product.id}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landingCost: Number(landingCost),
        standardPrice: Number(standardPrice),
        minimumPrice: Number(minimumPrice),
      }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setPriceMessage(data.message ?? "Failed to add price.");
      return;
    }

    setLandingCost("");
    setStandardPrice("");
    setMinimumPrice("");
    setPriceMessage("Price added successfully.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{product.displayName}</h1>
          <p className="text-sm text-slate-500">
            {product.category.name} · {product.brand.name}
            {product.technology ? ` · ${product.technology.name}` : ""}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/masters/products">Back to list</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current Price</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {product.currentPrice
              ? `₹${Number(product.currentPrice.standardPrice).toLocaleString("en-IN")}`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Minimum Price</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {product.currentPrice
              ? `₹${Number(product.currentPrice.minimumPrice).toLocaleString("en-IN")}`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">GST Rate</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{product.gstRate.toString()}%</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {product.isKit ? "System Size" : "Available Stock"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {product.isKit
              ? `${product.capacity} ${formatCapacityUnit(product.capacityUnit)}`
              : product.stock.availableStock}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {product.isKit ? <TabsTrigger value="bom">Components</TabsTrigger> : null}
          <TabsTrigger value="prices">Price History</TabsTrigger>
          {canEdit ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-slate-500">
                  {product.isKit ? "System kWp" : "Capacity"}
                </p>
                <p className="font-medium">
                  {product.capacity.toString()} {formatCapacityUnit(product.capacityUnit)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Pricing Type</p>
                <Badge>{formatPricingType(product.pricingType)}</Badge>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">HSN</p>
                <p className="font-medium">{product.hsn ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Serial Tracking</p>
                <p className="font-medium">
                  {product.isKit
                    ? "On components (panels / inverters)"
                    : product.serialTracking
                      ? "Yes"
                      : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Status</p>
                <Badge variant={product.isActive ? "success" : "danger"}>
                  {product.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {product.isKit ? (
          <TabsContent value="bom">
            <Card>
              <CardHeader>
                <CardTitle>Kit BOM</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Serial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.kitComponents.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.product.displayName}</TableCell>
                        <TableCell>{line.product.category.name}</TableCell>
                        <TableCell>{line.qty}</TableCell>
                        <TableCell>
                          {line.product.serialTracking ? "Yes" : "No"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {product.kitComponents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-500">
                          No components configured.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="prices">
          <div className="space-y-4">
            {canManagePricing ? (
              <Card>
                <CardHeader>
                  <CardTitle>Add New Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddPrice} className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="landingCost">Landing Cost</Label>
                      <Input
                        id="landingCost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={landingCost}
                        onChange={(e) => setLandingCost(e.target.value)}
                        required
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
                        required
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
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Button type="submit" disabled={loading}>
                        {loading ? "Saving..." : "Add price"}
                      </Button>
                      {priceMessage ? (
                        <p className="mt-2 text-sm text-slate-600">{priceMessage}</p>
                      ) : null}
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Price History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Effective To</TableHead>
                      <TableHead>Landing Cost</TableHead>
                      <TableHead>Standard Price</TableHead>
                      <TableHead>Minimum Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceHistory.map((price) => (
                      <TableRow key={price.id}>
                        <TableCell>{formatDate(price.effectiveFrom)}</TableCell>
                        <TableCell>
                          {price.effectiveTo ? formatDate(price.effectiveTo) : "Current"}
                        </TableCell>
                        <TableCell>₹{Number(price.landingCost).toLocaleString("en-IN")}</TableCell>
                        <TableCell>₹{Number(price.standardPrice).toLocaleString("en-IN")}</TableCell>
                        <TableCell>₹{Number(price.minimumPrice).toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    ))}
                    {priceHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500">
                          No prices configured yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {canEdit ? (
          <TabsContent value="edit">
            <ProductForm
              mode="edit"
              productId={product.id}
              categories={categories}
              brands={brands}
              technologies={technologies}
              canManagePricing={canManagePricing}
              initialValues={{
                categoryId: product.categoryId,
                brandName: product.brand.name,
                technologyName: product.technology?.name ?? "",
                capacity: product.capacity.toString(),
                capacityUnit: product.capacityUnit,
                hsn: product.hsn ?? "",
                gstRate: product.gstRate.toString(),
                isActive: product.isActive,
                kitComponents: product.kitComponents.map((line) => ({
                  productId: line.productId,
                  productName: line.product.displayName,
                  categoryName: line.product.category.name,
                  brandName: line.product.brand.name,
                  capacity: line.product.capacity,
                  capacityUnit: line.product.capacityUnit,
                  qty: line.qty,
                })),
              }}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
