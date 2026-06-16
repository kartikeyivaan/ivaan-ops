"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { defaultReportDateRange } from "@/lib/reports";
import { formatCurrency } from "@/lib/quotations";

type ReportKey =
  | "sales-executive"
  | "payment-followup"
  | "product-movement"
  | "booked-available"
  | "dispatch";

type ReportDefinition = {
  key: ReportKey;
  label: string;
  endpoint: string;
  description: string;
};

type WarehouseOption = { id: string; name: string };
type SalesExecutiveOption = { id: string; name: string };

const REPORTS: ReportDefinition[] = [
  {
    key: "sales-executive",
    label: "Sales Executive",
    endpoint: "/api/reports/sales-executive",
    description: "Dispatched value, quotations, PI, collections, and new customers by executive.",
  },
  {
    key: "payment-followup",
    label: "Payment Follow-up",
    endpoint: "/api/reports/payment-followup",
    description: "PI outstanding balances with ageing for collection follow-up.",
  },
  {
    key: "product-movement",
    label: "Product Movement",
    endpoint: "/api/reports/product-movement",
    description: "Opening to closing movement by product and warehouse.",
  },
  {
    key: "booked-available",
    label: "Booked vs Available",
    endpoint: "/api/reports/booked-available",
    description: "Sales commitment versus sellable stock with free quantity.",
  },
  {
    key: "dispatch",
    label: "Dispatch",
    endpoint: "/api/reports/dispatch",
    description: "Dispatched DC lines with customer, executive, and value.",
  },
];

function isMoneyColumn(key: string): boolean {
  return /value|paid|outstanding|amount/i.test(key);
}

export function ReportsHub({
  allowedReports,
  warehouses,
  salesExecutives,
  canFilterByExecutive,
}: {
  allowedReports: ReportKey[];
  warehouses: WarehouseOption[];
  salesExecutives: SalesExecutiveOption[];
  canFilterByExecutive: boolean;
}) {
  const defaults = defaultReportDateRange();
  const visibleReports = REPORTS.filter((report) => allowedReports.includes(report.key));
  const [activeReport, setActiveReport] = useState<ReportKey>(
    visibleReports[0]?.key ?? "sales-executive",
  );
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(defaults.fromDate);
  const [toDate, setToDate] = useState(defaults.toDate);
  const [salesUserId, setSalesUserId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [ageingBucket, setAgeingBucket] = useState("");
  const [q, setQ] = useState("");

  const currentReport = visibleReports.find((report) => report.key === activeReport)!;

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]!).filter(
      (key) => !key.endsWith("Id") && key !== "piId" && key !== "productId",
    );
  }, [rows]);

  function buildParams(format: "json" | "xlsx" | "pdf") {
    const params = new URLSearchParams();
    params.set("format", format);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (customerType) params.set("customerType", customerType);
    if (ageingBucket) params.set("ageingBucket", ageingBucket);
    if (q) params.set("q", q);
    return params;
  }

  async function runReport() {
    setLoading(true);
    const params = buildParams("json");
    const response = await fetch(`${currentReport.endpoint}?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) setRows(data);
  }

  function exportReport(format: "xlsx" | "pdf") {
    const params = buildParams(format);
    window.open(`${currentReport.endpoint}?${params.toString()}`, "_blank");
  }

  function formatCell(key: string, value: unknown) {
    if (typeof value === "number" && isMoneyColumn(key)) {
      return formatCurrency(value);
    }
    return String(value ?? "—");
  }

  function formatHeader(key: string) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (char) => char.toUpperCase());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Role-based operational reports with Excel and PDF export.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleReports.map((report) => (
          <Button
            key={report.key}
            variant={activeReport === report.key ? "default" : "outline"}
            onClick={() => {
              setActiveReport(report.key);
              setRows([]);
            }}
          >
            {report.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-slate-600">{currentReport.description}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activeReport !== "booked-available" && activeReport !== "payment-followup" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fromDate">From Date</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toDate">To Date</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </div>
              </>
            ) : null}

            {canFilterByExecutive &&
            (activeReport === "sales-executive" ||
              activeReport === "payment-followup" ||
              activeReport === "dispatch") ? (
              <div className="space-y-2">
                <Label htmlFor="salesUserId">Sales Executive</Label>
                <select
                  id="salesUserId"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={salesUserId}
                  onChange={(event) => setSalesUserId(event.target.value)}
                >
                  <option value="">All executives</option>
                  {salesExecutives.map((executive) => (
                    <option key={executive.id} value={executive.id}>
                      {executive.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {activeReport === "sales-executive" ? (
              <div className="space-y-2">
                <Label htmlFor="customerType">Customer Type</Label>
                <select
                  id="customerType"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={customerType}
                  onChange={(event) => setCustomerType(event.target.value)}
                >
                  <option value="">All types</option>
                  <option value="DEALER">Dealer</option>
                  <option value="PROJECT">Project</option>
                </select>
              </div>
            ) : null}

            {activeReport === "payment-followup" ? (
              <div className="space-y-2">
                <Label htmlFor="ageingBucket">Ageing Bucket</Label>
                <select
                  id="ageingBucket"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={ageingBucket}
                  onChange={(event) => setAgeingBucket(event.target.value)}
                >
                  <option value="">All buckets</option>
                  <option value="0-30">0-30 days</option>
                  <option value="31-60">31-60 days</option>
                  <option value="61-90">61-90 days</option>
                  <option value="90+">90+ days</option>
                </select>
              </div>
            ) : null}

            {activeReport === "product-movement" ||
            activeReport === "booked-available" ||
            activeReport === "dispatch" ? (
              <div className="space-y-2">
                <Label htmlFor="warehouseId">Warehouse</Label>
                <select
                  id="warehouseId"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  <option value="">All warehouses</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {activeReport === "product-movement" || activeReport === "booked-available" ? (
              <div className="space-y-2">
                <Label htmlFor="q">Product Search</Label>
                <Input
                  id="q"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Product or brand"
                />
              </div>
            ) : null}

            {activeReport === "dispatch" ? (
              <div className="space-y-2">
                <Label htmlFor="dispatchQ">Search</Label>
                <Input
                  id="dispatchQ"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="DC, PI, or customer"
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={runReport} disabled={loading}>
              {loading ? "Loading..." : "Run Report"}
            </Button>
            <Button variant="outline" onClick={() => exportReport("xlsx")} disabled={loading}>
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button variant="outline" onClick={() => exportReport("pdf")} disabled={loading}>
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Results</span>
            </div>
            <Badge variant="default">{rows.length} rows</Badge>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Run a report to see results. Export works even before previewing.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column}>{formatHeader(column)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      {columns.map((column) => (
                        <TableCell key={column}>{formatCell(column, row[column])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
