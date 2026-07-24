"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Download,
  Filter,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import type { ServicePriority, ServiceStatus } from "@prisma/client";
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
import { parseApiJson } from "@/lib/api-response";
import {
  SERVICE_PRIORITY_LABELS,
  formatServicePriority,
  formatServiceStatus,
  servicePriorityBadgeVariant,
  serviceStatusBadgeVariant,
} from "@/lib/service";
import { formatDate, formatDocumentDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ServiceImportWizard } from "@/components/service/service-import-wizard";

type WorkTypeOption = { id: string; name: string };
type ExecutiveOption = { id: string; name: string };

type ServiceListItem = {
  id: string;
  serviceRequestNumber: string;
  requestDate: string;
  updatedAt: string;
  customerName: string;
  mobileNumber: string | null;
  consumerNumber: string | null;
  workType: { id: string; name: string } | null;
  customWorkType: string | null;
  status: ServiceStatus;
  priority: ServicePriority;
  assignedTo: { id: string; name: string } | null;
  targetCompletionDate: string | null;
  delayDays: number;
  delayStatus: "ON_TRACK" | "DUE_TODAY" | "DELAYED" | null;
  pendingAmount: number;
};

type ListResponse = {
  items: ServiceListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const QUICK_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "my", label: "My Requests" },
  { value: "unassigned", label: "Unassigned" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "delayed", label: "Delayed" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const selectClass =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm max-md:min-h-11 max-md:text-base";

type SortField =
  | "requestDate"
  | "customerName"
  | "status"
  | "priority"
  | "targetCompletionDate"
  | "pendingAmount"
  | "updatedAt";

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function workTypeLabel(item: ServiceListItem) {
  return item.workType?.name ?? item.customWorkType ?? "—";
}

function DelayCell({ item }: { item: ServiceListItem }) {
  if (item.delayStatus === "DELAYED") {
    return <Badge variant="danger">{item.delayDays}d late</Badge>;
  }
  if (item.delayStatus === "DUE_TODAY") {
    return <Badge variant="warning">Due today</Badge>;
  }
  if (item.delayStatus === "ON_TRACK") {
    return <span className="text-slate-500">On track</span>;
  }
  return <span className="text-slate-400">—</span>;
}

export function ServiceRequestsList({
  workTypes,
  executives,
  showExecutiveFilter,
  canCreate,
  canImport = false,
  canExport = false,
}: {
  workTypes: WorkTypeOption[];
  executives: ExecutiveOption[];
  showExecutiveFilter: boolean;
  canCreate: boolean;
  canImport?: boolean;
  canExport?: boolean;
}) {
  const [items, setItems] = useState<ServiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const [quickFilter, setQuickFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [paymentPending, setPaymentPending] = useState(false);

  const [sortBy, setSortBy] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to first page whenever a filter/search/sort changes.
  useEffect(() => {
    setPage(1);
  }, [
    quickFilter,
    debouncedSearch,
    dateFrom,
    dateTo,
    workTypeId,
    priority,
    assignedToUserId,
    paymentPending,
    sortBy,
    sortDir,
  ]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (quickFilter) params.set("quickFilter", quickFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (workTypeId) params.set("workTypeId", workTypeId);
    if (priority) params.set("priority", priority);
    if (assignedToUserId) params.set("assignedToUserId", assignedToUserId);
    if (paymentPending) params.set("paymentPending", "true");
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [
    quickFilter,
    debouncedSearch,
    dateFrom,
    dateTo,
    workTypeId,
    priority,
    assignedToUserId,
    paymentPending,
    sortBy,
    sortDir,
    page,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/service?${queryString}`);
      if (!response.ok) {
        setError("Failed to load service requests.");
        return;
      }
      const data = await parseApiJson<ListResponse>(response);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setWorkTypeId("");
    setPriority("");
    setAssignedToUserId("");
    setPaymentPending(false);
  }

  const activeFilterCount =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (workTypeId ? 1 : 0) +
    (priority ? 1 : 0) +
    (assignedToUserId ? 1 : 0) +
    (paymentPending ? 1 : 0);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const visibleQuickFilters = showExecutiveFilter
    ? QUICK_FILTERS
    : QUICK_FILTERS.filter((f) => f.value !== "unassigned");

  function SortButton({ field, label }: { field: SortField; label: string }) {
    const active = sortBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="inline-flex items-center gap-1 font-medium hover:text-slate-900"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Service Requests</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <Button variant="outline" asChild>
              <a href="/api/service/export" download>
                <Download className="h-4 w-4" />
                Export
              </a>
            </Button>
          ) : null}
          {canImport ? (
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
          ) : null}
          {canCreate ? (
            <Button asChild>
              <Link href="/service/requests/new">
                <Plus className="h-4 w-4" />
                New Request
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {showImport ? (
        <ServiceImportWizard
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {visibleQuickFilters.map((filter) => (
          <button
            key={filter.value || "all"}
            type="button"
            onClick={() => setQuickFilter(filter.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              quickFilter === filter.value
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service requests"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="ml-1 rounded-full bg-emerald-600 px-1.5 text-xs text-white">
              {activeFilterCount}
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {drawerOpen ? (
        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterWorkType">Work Type</Label>
              <select
                id="filterWorkType"
                className={selectClass}
                value={workTypeId}
                onChange={(e) => setWorkTypeId(e.target.value)}
              >
                <option value="">All</option>
                {workTypes.map((wt) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterPriority">Priority</Label>
              <select
                id="filterPriority"
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="">All</option>
                {Object.entries(SERVICE_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {showExecutiveFilter ? (
              <div className="space-y-2">
                <Label htmlFor="filterExecutive">Assigned Executive</Label>
                <select
                  id="filterExecutive"
                  className={selectClass}
                  value={assignedToUserId}
                  onChange={(e) => setAssignedToUserId(e.target.value)}
                >
                  <option value="">All</option>
                  {executives.map((exec) => (
                    <option key={exec.id} value={exec.id}>
                      {exec.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={paymentPending}
                onChange={(e) => setPaymentPending(e.target.checked)}
              />
              Payment pending
            </label>
            <div className="md:col-span-3">
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-500">
            Loading service requests…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No service requests found</p>
            <p className="max-w-md text-sm text-slate-500">
              Try adjusting the filters or search, or create a new service request.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service ID</TableHead>
                  <TableHead>
                    <SortButton field="requestDate" label="Date" />
                  </TableHead>
                  <TableHead>
                    <SortButton field="customerName" label="Customer" />
                  </TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Consumer</TableHead>
                  <TableHead>Work Type</TableHead>
                  <TableHead>
                    <SortButton field="status" label="Status" />
                  </TableHead>
                  <TableHead>
                    <SortButton field="priority" label="Priority" />
                  </TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>
                    <SortButton field="targetCompletionDate" label="Target" />
                  </TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead className="text-right">
                    <SortButton field="pendingAmount" label="Pending" />
                  </TableHead>
                  <TableHead>
                    <SortButton field="updatedAt" label="Updated" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/service/requests/${item.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {item.serviceRequestNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDocumentDate(item.requestDate)}
                    </TableCell>
                    <TableCell>{item.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.mobileNumber ?? "—"}</TableCell>
                    <TableCell>{item.consumerNumber ?? "—"}</TableCell>
                    <TableCell>{workTypeLabel(item)}</TableCell>
                    <TableCell>
                      <Badge variant={serviceStatusBadgeVariant(item.status)}>
                        {formatServiceStatus(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={servicePriorityBadgeVariant(item.priority)}>
                        {formatServicePriority(item.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.assignedTo?.name ?? "Unassigned"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.targetCompletionDate
                        ? formatDocumentDate(item.targetCompletionDate)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DelayCell item={item} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {item.pendingAmount > 0 ? money(item.pendingAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500">
                      {formatDate(item.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {items.map((item) => (
              <Link key={item.id} href={`/service/requests/${item.id}`} className="block">
                <Card className="transition-colors hover:border-emerald-300">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-emerald-700">
                          {item.serviceRequestNumber}
                        </p>
                        <p className="text-sm font-medium text-slate-900">{item.customerName}</p>
                      </div>
                      <Badge variant={serviceStatusBadgeVariant(item.status)}>
                        {formatServiceStatus(item.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                      <span>{item.mobileNumber ?? "—"}</span>
                      <span>·</span>
                      <span>{workTypeLabel(item)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-slate-500">
                        {item.assignedTo?.name ?? "Unassigned"}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={servicePriorityBadgeVariant(item.priority)}>
                          {formatServicePriority(item.priority)}
                        </Badge>
                        <DelayCell item={item} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {from}–{to} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
