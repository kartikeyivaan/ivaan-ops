"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCapacityUnit, formatPricingType } from "@/lib/products";
import type { ProductListItem } from "@/lib/product-service";

type MasterOption = { id: string; name: string };

export function ProductsList({
  initialProducts,
  categories,
  brands,
  canEdit,
}: {
  initialProducts: ProductListItem[];
  categories: MasterOption[];
  brands: MasterOption[];
  canEdit: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoryId) params.set("categoryId", categoryId);
    if (brandId) params.set("brandId", brandId);

    const response = await fetch(`/api/products?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) setProducts(data);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Modules, inverters and other products with company-wise pricing.
          </p>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/masters/products/new">
              <Plus className="h-4 w-4" />
              New Product
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Product name or brand"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandId">Brand</Label>
            <select
              id="brandId"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">All</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Searching..." : "Apply filters"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Incoming</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Pricing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/masters/products/${product.id}`}
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      {product.displayName}
                    </Link>
                    {product.serialTracking ? (
                      <p className="text-xs text-slate-500">Serial tracked</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{product.brand.name}</TableCell>
                  <TableCell>{product.category.name}</TableCell>
                  <TableCell>
                    {product.capacity.toString()} {formatCapacityUnit(product.capacityUnit)}
                  </TableCell>
                  <TableCell>{product.stock.availableStock}</TableCell>
                  <TableCell>{product.stock.incomingStock}</TableCell>
                  <TableCell>{product.stock.bookedStock}</TableCell>
                  <TableCell>
                    {product.currentPrice
                      ? `₹${Number(product.currentPrice.standardPrice).toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge>{formatPricingType(product.pricingType)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
