"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  PackageSearch,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import type {
  InventoryTimelineItem,
  InventoryTimelineResponse,
} from "@/lib/inventory-timeline";
import { cn } from "@/lib/utils";

function reservedQtyHref(productId?: string, warehouseId?: string) {
  const params = new URLSearchParams({ report: "reserved-qty" });
  if (productId) params.set("productId", productId);
  if (warehouseId) params.set("warehouseId", warehouseId);
  return `/reports?${params.toString()}`;
}

type CompanyOption = { id: string; name: string; code: string };
type WarehouseOption = { id: string; name: string; companyId: string };
type ProductOption = { id: string; displayName: string };

function quantity(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 3,
  }).format(value);
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function dayName(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function TimelineCard({
  item,
  today,
  warehouseId,
}: {
  item: InventoryTimelineItem;
  today: string;
  warehouseId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const selectedDay =
    item.days.find((day) => day.date === selectedDate) ?? item.days[0];
  const indexByDate = new Map(item.days.map((day, index) => [day.date, index]));

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 sm:p-5"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">
            {item.productName}
          </p>
          <p className="truncate text-xs text-slate-500">
            {item.brandName} · {item.companyNames.join(", ")} ·{" "}
            {item.warehouseNames.join(", ")}
          </p>
        </div>
        <div className="hidden gap-6 text-right sm:flex">
          <div>
            <p className="text-xs text-slate-500">Physical</p>
            <p className="font-semibold text-slate-800">
              {quantity(item.physical)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Net today</p>
            <p
              className={cn(
                "font-semibold",
                item.netAvailableToday >= 0
                  ? "text-emerald-700"
                  : "text-rose-600",
              )}
            >
              {quantity(item.netAvailableToday)}
            </p>
          </div>
        </div>
      </button>

      {expanded ? (
        <CardContent className="border-t border-slate-100 p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Physical", item.physical],
              ["Reserved", item.reserved],
              ["Incoming", item.incoming],
              ["Safety", item.safety],
              ["Net available", item.netAvailableToday],
            ].map(([label, value]) => {
              const content = (
                <>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="font-semibold text-slate-900">
                    {quantity(value as number)}
                  </p>
                </>
              );
              if (label === "Reserved") {
                return (
                  <Link
                    key={label}
                    href={reservedQtyHref(item.productId, warehouseId || undefined)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 transition hover:border-emerald-400 hover:bg-emerald-100"
                    title="View reserved qty bookings for this product"
                  >
                    {content}
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                      View list
                    </p>
                  </Link>
                );
              }
              return (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  {content}
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="min-w-[1125px] bg-white p-3">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${item.days.length}, minmax(68px, 1fr))`,
                }}
              >
                {item.days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className={cn(
                      "relative rounded-lg border px-1 py-3 text-center transition",
                      day.date === selectedDate
                        ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50",
                      day.date === today &&
                        "after:absolute after:inset-x-2 after:top-0 after:h-0.5 after:bg-emerald-500",
                    )}
                  >
                    <span className="block text-[10px] uppercase text-slate-400">
                      {dayName(day.date)}
                    </span>
                    <span className="block text-xs font-medium text-slate-700">
                      {shortDate(day.date)}
                    </span>
                    <span
                      className={cn(
                        "mt-2 block text-sm font-bold",
                        day.closing >= 0
                          ? "text-emerald-700"
                          : "text-rose-600",
                      )}
                    >
                      {quantity(day.closing)}
                    </span>
                  </button>
                ))}
              </div>

              {item.arrivalWindows.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {item.arrivalWindows.map((window) => {
                    const start = indexByDate.get(window.visibleStartDate) ?? 0;
                    const end =
                      indexByDate.get(window.visibleEndDate) ?? start;
                    return (
                      <div
                        key={window.eventId}
                        className="grid gap-1"
                        style={{
                          gridTemplateColumns: `repeat(${item.days.length}, minmax(68px, 1fr))`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDate(window.visibleEndDate)}
                          className="truncate rounded-full bg-emerald-500 px-3 py-1 text-left text-[11px] font-medium text-white shadow-sm"
                          style={{ gridColumn: `${start + 1} / ${end + 2}` }}
                          title={`${window.sourceNumber ?? "Incoming"}: ${quantity(window.quantity)} (${shortDate(window.expectedMinDate)}–${shortDate(window.expectedMaxDate)})`}
                        >
                          +{quantity(window.quantity)} ·{" "}
                          {window.sourceNumber ?? "Incoming"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {selectedDay ? (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  {shortDate(selectedDay.date)} details
                </h3>
                {selectedDay.date === today ? (
                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                    Today
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-slate-500">Opening</p>
                  <p className="font-semibold">{quantity(selectedDay.opening)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Incoming</p>
                  <p className="font-semibold text-emerald-700">
                    +{quantity(selectedDay.incoming)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Received</p>
                  <p className="font-semibold text-emerald-700">
                    +{quantity(selectedDay.received)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Outgoing</p>
                  <p className="font-semibold text-rose-600">
                    -{quantity(selectedDay.outgoing)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Dispatched</p>
                  <p className="font-semibold text-rose-600">
                    -{quantity(selectedDay.dispatched)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Projected closing</p>
                  <p className="font-semibold">{quantity(selectedDay.closing)}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-emerald-100 pt-3 text-sm">
                {selectedDay.events.length === 0 ? (
                  <p className="text-slate-500">No inventory events this day.</p>
                ) : (
                  <ul className="divide-y divide-emerald-100">
                    {selectedDay.events.map((event) => {
                      const label = [
                        event.eventType.replaceAll("_", " "),
                        event.sourceNumber,
                        event.customerName,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      const isDispatched =
                        event.dispatchTodayStatus === "Dispatched";
                      const statusSuffix = event.dispatchTodayStatus
                        ? ` - ${event.dispatchTodayStatus}`
                        : "";
                      const shownQty =
                        event.displayQuantity ?? event.quantity;
                      return (
                        <li
                          key={event.id}
                          className="flex w-full items-start justify-between gap-3 py-1.5 first:pt-0 last:pb-0 text-slate-700"
                        >
                          <span className="min-w-0 flex-1 break-words">
                            {label}
                            {statusSuffix ? (
                              <span
                                className={
                                  isDispatched
                                    ? "font-bold text-emerald-700"
                                    : undefined
                                }
                              >
                                {statusSuffix}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {quantity(shownQty)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function InventoryTimeline({
  companies,
  warehouses,
  products,
  initialCompanyId,
}: {
  companies: CompanyOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  initialCompanyId: string;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [combined, setCombined] = useState(false);
  const [data, setData] = useState<InventoryTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const visibleWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) => combined || warehouse.companyId === companyId,
      ),
    [combined, companyId, warehouses],
  );

  async function load() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ combined: String(combined) });
    if (companyId) params.set("companyId", companyId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (productId) params.set("productId", productId);
    try {
      const response = await fetch(`/api/inventory/timeline?${params}`);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "Unable to load stock timeline.");
      }
      setData(body);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load stock timeline.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial request only; filters apply explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = data
    ? [
        ["Physical", data.totals.physical],
        ["Reserved", data.totals.reserved],
        ["Incoming", data.totals.incoming],
        ["Safety", data.totals.safety],
        ["Net today", data.totals.netAvailableToday],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Stock Timeline</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Fifteen-day physical, reserved, incoming and projected availability.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="timeline-company">Company</Label>
            <select
              id="timeline-company"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"
              value={companyId}
              disabled={combined}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setWarehouseId("");
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {companies.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={combined}
                  onChange={(event) => {
                    setCombined(event.target.checked);
                    setWarehouseId("");
                  }}
                  className="accent-emerald-600"
                />
                Combine all permitted companies
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline-warehouse">Warehouse</Label>
            <select
              id="timeline-warehouse"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">All warehouses</option>
              {visibleWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <TypeaheadSelect
            id="timeline-product"
            label="SKU / product"
            value={productId}
            onChange={setProductId}
            options={products.map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
            allowEmpty
            emptyLabel="All products"
            placeholder="Search SKU..."
          />

          <div className="flex items-end">
            <Button className="w-full" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Apply filters"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map(([label, value]) => {
          const content = (
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {quantity(value as number)}
              </p>
              {label === "Reserved" ? (
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                  View list
                </p>
              ) : null}
            </CardContent>
          );
          if (label === "Reserved") {
            return (
              <Link
                key={label}
                href={reservedQtyHref(productId || undefined, warehouseId || undefined)}
                className="rounded-xl transition hover:ring-2 hover:ring-emerald-300"
                title="View reserved qty bookings"
              >
                <Card className="h-full border-emerald-200 bg-emerald-50/60">{content}</Card>
              </Link>
            );
          }
          return <Card key={label}>{content}</Card>;
        })}
      </div>

      <div className="space-y-3">
        {loading && !data ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-slate-500">
              Loading stock timeline…
            </CardContent>
          </Card>
        ) : data?.items.length ? (
          data.items.map((item) => (
            <TimelineCard
              key={item.key}
              item={item}
              today={data.startDate}
              warehouseId={warehouseId}
            />
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <PackageSearch className="h-8 w-8 text-slate-400" />
              <p className="font-medium text-slate-700">
                No inventory found for these filters
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
