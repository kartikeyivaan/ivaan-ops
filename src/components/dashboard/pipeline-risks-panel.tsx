"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PipelineRiskDto, WorkQueueItem } from "@/lib/sales-dashboard/dashboard-types";
import { formatCurrency } from "@/components/dashboard/dashboard-formatters";

export function PipelineRisksPanel({ data }: { data: PipelineRiskDto }) {
  const tabs = [
    {
      id: "expiring",
      label: "Expiring quotes",
      count: data.expiringQuotations.length,
      content: <ExpiringRows items={data.expiringQuotations} />,
    },
    {
      id: "booked",
      label: "Booked, not dispatched",
      count: data.bookedNotDispatched.length,
      content: (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
          {data.bookedNotDispatched.length === 0 ? (
            <EmptyState />
          ) : (
            data.bookedNotDispatched.slice(0, 8).map((item) => (
              <Link
                key={item.piId}
                href={item.href}
                className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{item.piNo}</p>
                  <p className="text-sm text-slate-500">{item.customerName}</p>
                  <p className="text-xs text-slate-400">{item.executiveName}</p>
                </div>
                <Badge variant="warning">{item.daysSinceBooking}d since booking</Badge>
              </Link>
            ))
          )}
        </div>
      ),
    },
    {
      id: "outstanding",
      label: "High outstanding",
      count: data.highOutstanding.length,
      content: (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
          {data.highOutstanding.length === 0 ? (
            <EmptyState />
          ) : (
            data.highOutstanding.slice(0, 8).map((item) => (
              <Link
                key={item.customerId}
                href={`/reports?report=payment-followup&customerId=${item.customerId}`}
                className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{item.customerName}</p>
                  <p className="text-xs text-slate-400">{item.executiveName}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-slate-800">
                    {formatCurrency(item.outstanding)}
                  </p>
                  <p className="text-xs text-slate-500">{item.ageingDays}d ageing</p>
                </div>
              </Link>
            ))
          )}
        </div>
      ),
    },
    {
      id: "stuck",
      label: "Stuck PIs",
      count: data.stuckPis.length,
      content: <StuckPiRows items={data.stuckPis} />,
    },
  ] as const;

  const defaultTab = tabs.find((tab) => tab.count > 0)?.id ?? "expiring";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline Risks</CardTitle>
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
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ExpiringRows({ items }: { items: WorkQueueItem[] }) {
  const rows = items.filter((item) => item.kind === "expiring_quotation");
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
      {rows.slice(0, 8).map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50"
        >
          <div>
            <p className="font-medium text-slate-800">{item.quotationNo}</p>
            <p className="text-sm text-slate-500">{item.customerName}</p>
          </div>
          <Badge
            variant={
              item.urgency === "expired" || item.urgency === "today" ? "danger" : "warning"
            }
          >
            {item.urgency === "expired" ? "Expired" : item.expiryDate}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

function StuckPiRows({ items }: { items: WorkQueueItem[] }) {
  const rows = items.filter((item) => item.kind === "stuck_pi");
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
      {rows.slice(0, 8).map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50"
        >
          <div>
            <p className="font-medium text-slate-800">{item.piNo}</p>
            <p className="text-sm text-slate-500">{item.customerName}</p>
            <p className="text-xs text-slate-400">{item.status}</p>
          </div>
          <div className="text-right">
            <p className="font-medium text-slate-800">{formatCurrency(item.piValue)}</p>
            <p className="text-xs text-slate-500">{item.daysInStatus}d in status</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyState() {
  return <p className="py-8 text-center text-sm text-slate-500">Nothing flagged here.</p>;
}
