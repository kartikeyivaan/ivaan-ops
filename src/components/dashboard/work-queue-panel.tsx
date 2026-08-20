"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkQueueDto, WorkQueueItem } from "@/lib/sales-dashboard/dashboard-types";
import {
  buildExpiringQuotationsHref,
  buildUnpaidPisHref,
  formatCurrency,
} from "@/components/dashboard/dashboard-formatters";

export function WorkQueuePanel({
  data,
  salesUserId,
}: {
  data: WorkQueueDto;
  salesUserId?: string;
}) {
  const tabs = [
    {
      id: "expiring",
      label: "Expiring Quotes",
      count: data.counts.expiringQuotations,
      items: data.expiringQuotations,
      viewAllHref: buildExpiringQuotationsHref(salesUserId),
    },
    {
      id: "unpaid",
      label: "Unpaid PIs",
      count: data.counts.unpaidPis,
      items: data.unpaidPis,
      viewAllHref: buildUnpaidPisHref(salesUserId),
    },
    {
      id: "quiet",
      label: "Quiet Customers",
      count: data.counts.quietCustomers,
      items: data.quietCustomers,
      viewAllHref: undefined as string | undefined,
    },
    {
      id: "stuck",
      label: "Stuck PIs",
      count: data.counts.stuckPis,
      items: data.stuckPis,
      viewAllHref: undefined as string | undefined,
    },
  ] as const;

  const defaultTab = tabs.find((tab) => tab.count > 0)?.id ?? "expiring";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What Needs My Attention</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-2 flex h-auto w-full flex-wrap justify-start gap-1">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                {tab.label}
                <Badge variant={tab.count > 0 ? "warning" : "default"}>{tab.count}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              {tab.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Nothing here right now.</p>
              ) : (
                <div className="space-y-2">
                  <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
                    {tab.items.slice(0, 8).map((item) => (
                      <WorkQueueRow key={`${item.kind}-${item.id}`} item={item} />
                    ))}
                  </div>
                  {"viewAllHref" in tab && tab.viewAllHref ? (
                    <div className="text-right">
                      <Link
                        href={tab.viewAllHref}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        View all
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function WorkQueueRow({ item }: { item: WorkQueueItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{rowTitle(item)}</p>
        <p className="truncate text-xs text-slate-500">{rowSubtitle(item)}</p>
      </div>
      <div className="shrink-0">{rowBadge(item)}</div>
    </Link>
  );
}

function rowTitle(item: WorkQueueItem): string {
  switch (item.kind) {
    case "expiring_quotation":
      return `${item.customerName} · ${item.quotationNo}`;
    case "unpaid_pi":
      return `${item.customerName} · ${item.piNo}`;
    case "quiet_customer":
      return item.customerName;
    case "stuck_pi":
      return `${item.customerName} · ${item.piNo}`;
  }
}

function rowSubtitle(item: WorkQueueItem): string {
  switch (item.kind) {
    case "expiring_quotation":
      return `Expires ${item.expiryDate}`;
    case "unpaid_pi":
      return `${formatCurrency(item.outstanding)} outstanding · ${item.ageingDays}d`;
    case "quiet_customer":
      return item.lastActivityDate
        ? `Last activity ${item.lastActivityDate} · ${item.inactiveDays}d inactive`
        : `${item.inactiveDays} days without activity`;
    case "stuck_pi":
      return `${item.status} · ${item.daysInStatus}d · ${formatCurrency(item.piValue)}`;
  }
}

function rowBadge(item: WorkQueueItem) {
  switch (item.kind) {
    case "expiring_quotation":
      if (item.urgency === "expired") return <Badge variant="danger">Expired</Badge>;
      if (item.urgency === "today") return <Badge variant="warning">Today</Badge>;
      return <Badge variant="warning">Soon</Badge>;
    case "unpaid_pi":
      return <Badge variant="warning">Unpaid</Badge>;
    case "quiet_customer":
      return <Badge variant="default">Quiet</Badge>;
    case "stuck_pi":
      return <Badge variant="danger">Stuck</Badge>;
  }
}
