"use client";

import { parseApiJson } from "@/lib/api-response";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(product: ProductListItem) {
    const confirmed = window.confirm(
      `Delete ${product.displayName}? Products with existing records will be deactivated instead.`,
    );
    if (!confirmed) return;

    setDeletingId(product.id);
    setMessage(null);

    const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const data = await parseApiJson<{ message?: string; deactivated?: boolean }>(response);
    setDeletingId(null);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to delete product.");
      return;
    }

    if (data.deactivated) {
      setMessage(
        data.message ??
          "Product has existing inventory, sales, or transaction records and was deactivated instead of permanently deleted.",
      );
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, isActive: false } : item,
        ),
      );
    } else {
      setMessage(`${product.displayName} was permanently deleted.`);
      setProducts((current) => current.filter((item) => item.id !== product.id));
    }

    router.refresh();
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

      <CollapsibleFilterCard title="Search & Filter" contentClassName="grid gap-4 md:grid-cols-3">
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
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="pt-6">
          {message ? <p className="mb-4 text-sm text-slate-600">{message}</p> : null}
          <Table responsive>
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
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell data-label="Product">
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
                  <TableCell data-label="Brand">{product.brand.name}</TableCell>
                  <TableCell data-label="Category">{product.category.name}</TableCell>
                  <TableCell data-label="Capacity">
                    {product.capacity.toString()} {formatCapacityUnit(product.capacityUnit)}
                  </TableCell>
                  <TableCell data-label="Available">{product.stock.availableStock}</TableCell>
                  <TableCell data-label="Incoming">{product.stock.incomingStock}</TableCell>
                  <TableCell data-label="Booked">{product.stock.bookedStock}</TableCell>
                  <TableCell data-label="Current Price">
                    {product.currentPrice
                      ? `₹${Number(product.currentPrice.standardPrice).toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell data-label="Pricing">
                    <Badge>{formatPricingType(product.pricingType)}</Badge>
                  </TableCell>
                  <TableCell data-label="Status">
                    <Badge variant={product.isActive ? "success" : "danger"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`More options for ${product.displayName}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/masters/products/${product.id}`}>Edit Product</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:bg-red-50 focus:text-red-700"
                            disabled={deletingId === product.id}
                            onClick={() => handleDelete(product)}
                          >
                            {deletingId === product.id ? "Deleting..." : "Delete Product"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 11 : 10}
                    className="text-center text-slate-500"
                  >
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
