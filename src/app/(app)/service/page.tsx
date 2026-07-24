import Link from "next/link";
import { ServiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServiceAccess } from "@/lib/service-guard";
import { canCreateService, restrictServiceToAssigned } from "@/lib/service-permissions";
import { getServiceDashboardMetrics, listServiceRequests } from "@/lib/service-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatServiceStatus, serviceStatusBadgeVariant } from "@/lib/service";

const ACTIVE_STATUSES: ServiceStatus[] = [
  ServiceStatus.OPEN,
  ServiceStatus.ASSIGNED,
  ServiceStatus.IN_PROGRESS,
  ServiceStatus.WAITING,
  ServiceStatus.REOPENED,
];

type MetricCard = {
  label: string;
  value: string;
  href: string;
  tone?: "default" | "warning" | "danger";
};

type ListItem = {
  id: string;
  serviceRequestNumber: string;
  customerName: string;
  status: ServiceStatus;
  workType: { name: string } | null;
  customWorkType: string | null;
  targetCompletionDate: Date | string | null;
  delayDays: number;
  delayStatus: "ON_TRACK" | "DUE_TODAY" | "DELAYED" | null;
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function RequestRow({ item }: { item: ListItem }) {
  return (
    <Link
      href={`/service/requests/${item.id}`}
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{item.customerName}</p>
        <p className="truncate text-xs text-slate-500">
          {item.serviceRequestNumber} · {item.workType?.name ?? item.customWorkType ?? "—"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.delayStatus === "DELAYED" ? (
          <Badge variant="danger">{item.delayDays}d late</Badge>
        ) : item.delayStatus === "DUE_TODAY" ? (
          <Badge variant="warning">Due today</Badge>
        ) : null}
        <Badge variant={serviceStatusBadgeVariant(item.status)}>
          {formatServiceStatus(item.status)}
        </Badge>
      </div>
    </Link>
  );
}

export default async function ServiceDashboardPage() {
  const { companyId, roles, userId } = await requireServiceAccess();
  const restrictToUserId = restrictServiceToAssigned(roles) ? userId : null;

  const [metrics, myWorkResult, needsAttentionResult] = await Promise.all([
    getServiceDashboardMetrics(prisma, companyId, restrictToUserId),
    listServiceRequests(prisma, companyId, {
      restrictToUserId: userId,
      page: 1,
      pageSize: 25,
      sortDir: "desc",
    }),
    listServiceRequests(prisma, companyId, {
      quickFilter: "delayed",
      restrictToUserId,
      page: 1,
      pageSize: 6,
      sortDir: "desc",
    }),
  ]);

  const myWork = myWorkResult.items
    .filter((item) => ACTIVE_STATUSES.includes(item.status))
    .slice(0, 6);
  const needsAttention = needsAttentionResult.items;

  const cards: MetricCard[] = [
    { label: "Open Requests", value: String(metrics.open), href: "/service/requests?quickFilter=open" },
    {
      label: "Unassigned",
      value: String(metrics.unassigned),
      href: "/service/requests?quickFilter=unassigned",
    },
    {
      label: "In Progress",
      value: String(metrics.inProgress),
      href: "/service/requests?quickFilter=in_progress",
    },
    {
      label: "Waiting",
      value: String(metrics.waiting),
      href: "/service/requests?quickFilter=waiting",
    },
    {
      label: "Delayed",
      value: String(metrics.delayed),
      href: "/service/requests?quickFilter=delayed",
      tone: "danger",
    },
    {
      label: "Due Today",
      value: String(metrics.dueToday),
      href: "/service/requests",
      tone: "warning",
    },
    {
      label: "Completed This Month",
      value: String(metrics.completedThisMonth),
      href: "/service/requests?quickFilter=completed",
    },
    {
      label: "Pending Service Amount",
      value: money(metrics.pendingServiceAmount),
      href: "/service/requests",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Service Dashboard</h1>
        {canCreateService(roles) ? (
          <Button asChild>
            <Link href="/service/requests/new">New Request</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-colors hover:border-emerald-300">
              <CardContent className="p-4">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p
                  className={
                    card.tone === "danger"
                      ? "text-2xl font-semibold text-red-600"
                      : card.tone === "warning"
                        ? "text-2xl font-semibold text-amber-600"
                        : "text-2xl font-semibold text-slate-900"
                  }
                >
                  {card.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Work</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {myWork.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No active requests assigned to you.
              </p>
            ) : (
              <div className="space-y-1">
                {myWork.map((item) => (
                  <RequestRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs Attention</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {needsAttention.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                Nothing overdue right now.
              </p>
            ) : (
              <div className="space-y-1">
                {needsAttention.map((item) => (
                  <RequestRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
