"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";

type ProductOption = { id: string; displayName: string };
type WarehouseOption = { id: string; name: string };

type AvailableSerialRow = {
  index: number;
  serialNumber: string;
  warehouse: string;
  warehouseId: string;
  lotNumber: string;
  productName: string;
  status: string;
  createdAt: string;
};

type AvailableSerialsResponse = {
  product: { id: string; displayName: string };
  count: number;
  items: AvailableSerialRow[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function AvailableSerialsView({
  products,
  warehouses,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
}) {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AvailableSerialsResponse | null>(null);

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.displayName,
      })),
    [products],
  );

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        value: warehouse.id,
        label: warehouse.name,
      })),
    [warehouses],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    return params.toString();
  }, [productId, warehouseId]);

  const load = useCallback(async () => {
    if (!productId) {
      setError("Select a product.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/inventory/serials/available?${queryString}`);
      const data = await response.json();
      if (!response.ok) {
        setResult(null);
        setError(data.message ?? "Unable to load serials.");
        return;
      }
      setResult(data as AvailableSerialsResponse);
    } catch {
      setResult(null);
      setError("Failed to load available serials.");
    } finally {
      setLoading(false);
    }
  }, [productId, queryString]);

  const exportHref = `/api/inventory/serials/available?${queryString}&format=xlsx`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Available Serials</h1>
          <p className="text-sm text-slate-500">
            List in-stock serial numbers for a selected product.
          </p>
        </div>
        {productId ? (
          <Button variant="outline" asChild className="h-10">
            <a href={exportHref} download>
              <Download className="h-4 w-4" />
              Download Excel
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="h-10" disabled>
            <Download className="h-4 w-4" />
            Download Excel
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select product</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <TypeaheadSelect
            label="Product"
            required
            options={productOptions}
            value={productId}
            onChange={(value) => {
              setProductId(value);
              setResult(null);
              setError("");
            }}
            placeholder="Search product..."
          />
          <TypeaheadSelect
            label="Warehouse"
            allowEmpty
            emptyLabel="All warehouses"
            options={warehouseOptions}
            value={warehouseId}
            onChange={(value) => {
              setWarehouseId(value);
              setResult(null);
              setError("");
            }}
            placeholder="Optional filter..."
          />
          <div className="flex items-end">
            <Button onClick={load} disabled={!productId || loading} className="w-full md:w-auto">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Show serials
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {result ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{result.product.displayName}</CardTitle>
              <p className="text-sm text-slate-500">
                {result.count} available serial{result.count === 1 ? "" : "s"}
              </p>
            </div>
            <Badge variant="success">{result.count} in stock</Badge>
          </CardHeader>
          <CardContent>
            {result.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No available serials in stock for this product.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recorded On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.items.map((row) => (
                      <TableRow key={`${row.serialNumber}-${row.warehouseId}`}>
                        <TableCell className="text-slate-500">{row.index}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {row.serialNumber}
                        </TableCell>
                        <TableCell>{row.warehouse}</TableCell>
                        <TableCell>{row.lotNumber}</TableCell>
                        <TableCell>
                          <Badge variant="success">{row.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
