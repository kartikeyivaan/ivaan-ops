"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import { defaultReportDateRange } from "@/lib/reports";
import { getBusinessToday } from "@/lib/business-dates";
import { formatCurrency } from "@/lib/quotations";

type ReportKey =
  | "sales-executive"
  | "sales-performance"
  | "sales-funnel"
  | "executive-performance"
  | "collection"
  | "payment-followup"
  | "product-movement"
  | "booked-available"
  | "reserved-qty"
  | "dispatch"
  | "dispatch-profit"
  | "executive-sales";

type ReportDefinition = {
  key: ReportKey;
  label: string;
  endpoint: string;
  description: string;
};

type WarehouseOption = { id: string; name: string };
type SalesExecutiveOption = { id: string; name: string };
type ProductOption = { id: string; displayName: string };
type CompanyOption = { id: string; name: string; code: string };

const REPORTS: ReportDefinition[] = [
  {
    key: "sales-executive",
    label: "Sales Executive",
    endpoint: "/api/reports/sales-executive",
    description: "Dispatched value, quotations, PI, collections, and new customers by executive.",
  },
  {
    key: "sales-performance",
    label: "Sales Performance",
    endpoint: "/api/reports/sales-performance",
    description:
      "Detailed executive performance with quotation, PI, collection, dispatch, and unit mix.",
  },
  {
    key: "sales-funnel",
    label: "Sales Funnel",
    endpoint: "/api/reports/sales-funnel",
    description: "Stage values and conversion rates from quotation through dispatch.",
  },
  {
    key: "executive-performance",
    label: "Executive Performance",
    endpoint: "/api/reports/executive-performance",
    description: "Monthly targets, module mastery, and KPI composite by executive.",
  },
  {
    key: "collection",
    label: "Collection",
    endpoint: "/api/reports/collection",
    description: "Collections received in the period plus current outstanding balances.",
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
    key: "reserved-qty",
    label: "Reserved Qty",
    endpoint: "/api/reports/reserved-qty",
    description:
      "Active reserved quantity by product with committed date, customer, rate, and booking amount.",
  },
  {
    key: "dispatch",
    label: "Daily Dispatch",
    endpoint: "/api/reports/dispatch",
    description:
      "Continuous listing of confirmed dispatches for the selected day — PI, firm details, product, qty, and serial numbers.",
  },
  {
    key: "dispatch-profit",
    label: "Dispatch Profit",
    endpoint: "/api/reports/dispatch-profit",
    description:
      "Per-line dispatch profit (ex-GST) from snapshotted revenue, COGS, margin, and cost source.",
  },
  {
    key: "executive-sales",
    label: "Sales Executive Report",
    endpoint: "/api/reports/executive-sales",
    description:
      "Dispatched sales by executive for the selected period — customer firm, product, qty, PI and DC numbers.",
  },
];

const RESERVED_QTY_COLUMNS = [
  "committedDate",
  "customerName",
  "productName",
  "piNo",
  "totalQty",
  "totalAmount",
  "ratePerWp",
  "bookingAmount",
] as const;

const EXECUTIVE_SALES_COLUMNS = [
  "srNo",
  "date",
  "seName",
  "companyName",
  "productName",
  "qty",
  "piNumber",
  "dcNumber",
] as const;

function isMoneyColumn(key: string): boolean {
  return /value|paid|outstanding|amount|ratePerWp|collectionAmount|revenueExGst|cogsExGst|profitExGst/i.test(
    key,
  );
}

function isUnitColumn(key: string): boolean {
  return /Units|moduleUnits|inverterUnits|otherUnits|targetModules|achievedModules|modulesDispatched/i.test(
    key,
  );
}

function formatHeader(key: string) {
  if (key === "srNo") return "Sr Number";
  if (key === "date") return "Date";
  if (key === "seName") return "SE Name";
  if (key === "companyName") return "Company Name";
  if (key === "piNumber") return "PI Number";
  if (key === "dcNumber") return "DC Number";
  if (key === "ratePerWp") return "Rate (per Wp)";
  if (key === "piNo") return "PI No";
  if (key === "piDate") return "PI Date";
  if (key === "dcNo") return "DC No";
  if (key === "committedDate") return "Committed Date";
  if (key === "customerName") return "Customer Name";
  if (key === "firmName") return "Firm Name";
  if (key === "firmCode") return "Firm Code";
  if (key === "firmGst") return "Firm GST";
  if (key === "firmAddress") return "Firm Address";
  if (key === "firmMobile") return "Firm Mobile";
  if (key === "serialNumbers") return "Serial Numbers";
  if (key === "dispatchDate") return "Dispatch Date";
  if (key === "totalQty") return "Total Qty";
  if (key === "totalAmount") return "Total Amount";
  if (key === "bookingAmount") return "Booking Amount";
  if (key === "productName") return "Product";
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

export function ReportsHub({
  allowedReports,
  companies,
  warehouses,
  products,
  salesExecutives,
  canFilterByExecutive,
  reportShortcuts,
}: {
  allowedReports: ReportKey[];
  companies: CompanyOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  salesExecutives: SalesExecutiveOption[];
  canFilterByExecutive: boolean;
  reportShortcuts: Array<{ label: string; description: string; href: string }>;
}) {
  const searchParams = useSearchParams();
  const defaults = defaultReportDateRange();
  const visibleReports = REPORTS.filter((report) => allowedReports.includes(report.key));

  const initialReport = (() => {
    const requested = searchParams.get("report") as ReportKey | null;
    if (requested && visibleReports.some((report) => report.key === requested)) {
      return requested;
    }
    return visibleReports[0]?.key ?? "sales-executive";
  })();

  const [activeReport, setActiveReport] = useState<ReportKey>(initialReport);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    if (searchParams.get("fromDate")) return searchParams.get("fromDate")!;
    if (initialReport === "dispatch") return getBusinessToday();
    return defaults.fromDate;
  });
  const [toDate, setToDate] = useState(() => {
    if (searchParams.get("toDate")) return searchParams.get("toDate")!;
    if (initialReport === "dispatch") {
      return searchParams.get("fromDate") ?? getBusinessToday();
    }
    return defaults.toDate;
  });
  const [salesUserId, setSalesUserId] = useState(searchParams.get("salesUserId") ?? "");
  const [selectedSalesUserIds, setSelectedSalesUserIds] = useState<string[]>(() => {
    const raw = searchParams.get("salesUserIds");
    if (!raw) return [];
    return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>(() => {
    const raw = searchParams.get("companyIds");
    if (!raw) return [];
    return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  });
  const [warehouseId, setWarehouseId] = useState(
    searchParams.get("warehouseId") ?? "",
  );
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [customerType, setCustomerType] = useState(searchParams.get("customerType") ?? "");
  const [ageingBucket, setAgeingBucket] = useState(searchParams.get("ageingBucket") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [didAutoRun, setDidAutoRun] = useState(false);

  const currentReport = visibleReports.find((report) => report.key === activeReport)!;

  const columns = useMemo(() => {
    if (activeReport === "executive-sales") {
      return [...EXECUTIVE_SALES_COLUMNS];
    }
    if (activeReport === "reserved-qty" && rows.length > 0) {
      return [...RESERVED_QTY_COLUMNS];
    }
    if (rows.length === 0) return [];
    return Object.keys(rows[0]!).filter(
      (key) => !key.endsWith("Id") && key !== "piId" && key !== "productId",
    );
  }, [activeReport, rows]);

  function buildParams(format: "json" | "xlsx" | "pdf") {
    const params = new URLSearchParams();
    params.set("format", format);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (activeReport === "executive-sales" && selectedSalesUserIds.length) {
      params.set("salesUserIds", selectedSalesUserIds.join(","));
    }
    if (activeReport === "executive-sales" && selectedCompanyIds.length) {
      params.set("companyIds", selectedCompanyIds.join(","));
    }
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (productId) params.set("productId", productId);
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

  useEffect(() => {
    if (didAutoRun) return;
    const requested = searchParams.get("report");
    if (!requested) return;
    if (activeReport !== requested) return;
    setDidAutoRun(true);
    void runReport();
    // Deep-link from dashboard / stock timeline: run once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, didAutoRun, searchParams]);

  function exportReport(format: "xlsx" | "pdf") {
    const params = buildParams(format);
    window.open(`${currentReport.endpoint}?${params.toString()}`, "_blank");
  }

  function formatCell(key: string, value: unknown) {
    if (typeof value === "number" && isMoneyColumn(key)) {
      return formatCurrency(value);
    }
    if (typeof value === "number" && key === "conversionPercent") {
      return `${value}%`;
    }
    if (typeof value === "number" && key === "marginPercent") {
      return `${value.toFixed(2)}%`;
    }
    if (value === null || value === undefined) {
      return "—";
    }
    if (typeof value === "number" && (key === "targetProgressPercent" || isUnitColumn(key))) {
      return value.toLocaleString("en-IN", { maximumFractionDigits: key.includes("Percent") ? 1 : 0 });
    }
    return String(value ?? "—");
  }

  function toggleSalesExecutive(id: string) {
    setSelectedSalesUserIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function selectAllSalesExecutives() {
    setSelectedSalesUserIds(salesExecutives.map((executive) => executive.id));
  }

  function clearSalesExecutives() {
    setSelectedSalesUserIds([]);
  }

  function toggleCompany(id: string) {
    setSelectedCompanyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function selectAllCompanies() {
    setSelectedCompanyIds(companies.map((company) => company.id));
  }

  function clearCompanies() {
    setSelectedCompanyIds([]);
  }

  const salesKpiReports = new Set<ReportKey>([
    "sales-executive",
    "sales-performance",
    "sales-funnel",
    "executive-performance",
  ]);

  const executiveFilterReports = new Set<ReportKey>([
    "sales-executive",
    "sales-performance",
    "sales-funnel",
    "executive-performance",
    "payment-followup",
    "collection",
    "dispatch",
  ]);

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
              if (report.key === "dispatch") {
                const day = getBusinessToday();
                setFromDate(day);
                setToDate(day);
              }
            }}
          >
            {report.label}
          </Button>
        ))}
      </div>

      {reportShortcuts.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {reportShortcuts.map((shortcut) => (
            <Card key={shortcut.label}>
              <CardContent className="space-y-3 pt-6">
                <div>
                  <p className="font-medium text-slate-900">{shortcut.label}</p>
                  <p className="text-sm text-slate-500">{shortcut.description}</p>
                </div>
                <Button asChild variant="outline">
                  <Link href={shortcut.href}>Open report</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-slate-600">{currentReport.description}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activeReport === "dispatch" ? (
              <div className="space-y-2">
                <Label htmlFor="dispatchDate">Dispatch Date</Label>
                <Input
                  id="dispatchDate"
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    const day = event.target.value;
                    setFromDate(day);
                    setToDate(day);
                  }}
                />
              </div>
            ) : activeReport !== "booked-available" &&
              activeReport !== "payment-followup" &&
              activeReport !== "reserved-qty" ? (
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

            {activeReport === "executive-sales" && companies.length > 0 ? (
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Companies</Label>
                  {companies.length > 1 ? (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={selectAllCompanies}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={clearCompanies}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  {companies.length > 1
                    ? "Leave none selected to include ISE and PCMV."
                    : "Report runs for your company."}
                </p>
                <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selectedCompanyIds.includes(company.id)}
                        onChange={() => toggleCompany(company.id)}
                        disabled={companies.length === 1}
                      />
                      {company.code}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {activeReport === "executive-sales" && canFilterByExecutive ? (
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Sales Executives</Label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={selectAllSalesExecutives}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={clearSalesExecutives}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Leave none selected to include all executives.
                </p>
                <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {salesExecutives.map((executive) => (
                    <label
                      key={executive.id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selectedSalesUserIds.includes(executive.id)}
                        onChange={() => toggleSalesExecutive(executive.id)}
                      />
                      {executive.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {canFilterByExecutive &&
            executiveFilterReports.has(activeReport) &&
            activeReport !== "executive-sales" ? (
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

            {salesKpiReports.has(activeReport) ? (
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

            {activeReport === "payment-followup" || activeReport === "collection" ? (
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
            activeReport === "reserved-qty" ||
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

            {activeReport === "reserved-qty" ? (
              <TypeaheadSelect
                id="report-product"
                label="Product"
                value={productId}
                onChange={setProductId}
                options={products.map((product) => ({
                  value: product.id,
                  label: product.displayName,
                }))}
                allowEmpty
                emptyLabel="All products"
                placeholder="Search product..."
              />
            ) : null}

            {activeReport === "product-movement" ||
            activeReport === "booked-available" ||
            activeReport === "reserved-qty" ? (
              <div className="space-y-2">
                <Label htmlFor="q">
                  {activeReport === "reserved-qty"
                    ? "Search"
                    : "Product Search"}
                </Label>
                <Input
                  id="q"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={
                    activeReport === "reserved-qty"
                      ? "Product, customer, or PI"
                      : "Product or brand"
                  }
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
              {loading
                ? "Loading results…"
                : activeReport === "executive-sales"
                  ? "Run the report to preview results. Export Excel or PDF anytime."
                  : "Run a report to see results. Export works even before previewing."}
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
