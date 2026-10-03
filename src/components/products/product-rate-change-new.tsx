"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProductOption = {
  id: string;
  displayName: string;
  currentStandardPrice: number | null;
  currentMinimumPrice: number | null;
};

type EditableLine = {
  key: string;
  productId: string;
  productName: string;
  standardPrice: string;
  minimumPrice: string;
};

export function ProductRateChangeNew() {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>([
    {
      key: "line-0",
      productId: "",
      productName: "",
      standardPrice: "",
      minimumPrice: "",
    },
  ]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products?isActive=true")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setProducts(
          data.map(
            (row: {
              id: string;
              displayName: string;
              currentPrice?: { standardPrice: number; minimumPrice: number } | null;
            }) => ({
              id: row.id,
              displayName: row.displayName,
              currentStandardPrice: row.currentPrice?.standardPrice ?? null,
              currentMinimumPrice: row.currentPrice?.minimumPrice ?? null,
            }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.displayName.toLowerCase().includes(q)).slice(0, 20);
  }, [productSearch, products]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}`,
        productId: "",
        productName: "",
        standardPrice: "",
        minimumPrice: "",
      },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    updateLine(key, {
      productId: product.id,
      productName: product.displayName,
      standardPrice:
        product.currentStandardPrice != null ? String(product.currentStandardPrice) : "",
      minimumPrice:
        product.currentMinimumPrice != null ? String(product.currentMinimumPrice) : "",
    });
    setProductSearch("");
  }

  async function createDraft() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/product-rate-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: lines.map((line) => ({
          productId: line.productId,
          standardPrice: Number(line.standardPrice),
          minimumPrice: Number(line.minimumPrice),
        })),
      }),
    });
    const data = await parseApiJson<{ id?: string; message?: string }>(response);
    setLoading(false);
    if (!response.ok || !data.id) {
      setMessage(data.message ?? "Unable to create batch.");
      return;
    }
    router.push(`/masters/products/rate-changes/${data.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/masters/products/rate-changes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Rate changes
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">New rate change</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Product lines</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-2 h-4 w-4" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-12"
            >
              <div className="space-y-2 md:col-span-5">
                <Label>Product</Label>
                <Input
                  list={`products-${line.key}`}
                  value={line.productName || productSearch}
                  placeholder="Search product…"
                  onChange={(e) => {
                    const value = e.target.value;
                    setProductSearch(value);
                    updateLine(line.key, { productName: value, productId: "" });
                  }}
                  onBlur={() => {
                    const match = products.find(
                      (p) => p.displayName.toLowerCase() === line.productName.trim().toLowerCase(),
                    );
                    if (match) selectProduct(line.key, match.id);
                  }}
                />
                <datalist id={`products-${line.key}`}>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.displayName} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Standard price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.standardPrice}
                  onChange={(e) => updateLine(line.key, { standardPrice: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Minimum price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.minimumPrice}
                  onChange={(e) => updateLine(line.key, { minimumPrice: e.target.value })}
                />
              </div>
              <div className="flex items-end md:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLine(line.key)}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
            </div>
          ))}

          <Button type="button" disabled={loading} onClick={createDraft}>
            Save as draft
          </Button>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
