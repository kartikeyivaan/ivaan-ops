"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TaskCreateDialog } from "@/components/tasks/task-create-dialog";
import { TaskListTable, type TaskListItem } from "@/components/tasks/task-list-table";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/task-display";

type TabId = "mine" | "todo" | "assigned" | "team" | "all";

type ListResponse = {
  items: TaskListItem[];
  total: number;
  counts?: Record<string, number>;
  employeeSummary?: Array<{
    employeeId: string;
    employeeName: string;
    open: number;
    dueToday: number;
    overdue: number;
  }>;
};

const TAB_ENDPOINTS: Record<TabId, string> = {
  mine: "/api/tasks",
  todo: "/api/tasks/todo",
  assigned: "/api/tasks/assigned-by-me",
  team: "/api/tasks/team",
  all: "/api/tasks/all",
};

export function TasksHub({
  currentUserId,
  canViewTeam,
  canViewAll,
}: {
  currentUserId: string;
  canViewTeam: boolean;
  canViewAll: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: TabId =
    requestedTab === "todo" ||
    requestedTab === "assigned" ||
    (requestedTab === "team" && canViewTeam) ||
    (requestedTab === "all" && canViewAll)
      ? requestedTab
      : "mine";

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [priority, setPriority] = useState(searchParams.get("priority") ?? "");
  const [overdue, setOverdue] = useState(searchParams.get("overdue") === "true");
  const [view, setView] = useState(searchParams.get("view") ?? "");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (overdue) params.set("overdue", "true");
    if (view) params.set("view", view);
    return params.toString();
  }, [q, status, priority, overdue, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`${TAB_ENDPOINTS[tab]}${queryString ? `?${queryString}` : ""}`);
    if (!response.ok) {
      setError("Could not load tasks.");
      setData(null);
      setLoading(false);
      return;
    }
    setData(await response.json());
    setLoading(false);
  }, [tab, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  const counts = data?.counts ?? {};
  const cards =
    tab === "todo"
      ? [
          { key: "todo", label: "To-Do", value: counts.todo ?? 0, view: "todo" },
          { key: "inProgress", label: "In Progress", value: counts.inProgress ?? 0, view: "in_progress" },
          { key: "completed", label: "Completed", value: counts.completed ?? 0, view: "completed" },
        ]
      : tab === "assigned"
        ? [
            { key: "awaitingAcknowledgement", label: "Awaiting Acknowledgement", value: counts.awaitingAcknowledgement ?? 0 },
            { key: "acknowledged", label: "Acknowledged", value: counts.acknowledged ?? 0 },
            { key: "inProgress", label: "In Progress", value: counts.inProgress ?? 0, view: "in_progress" },
            { key: "completed", label: "Completed", value: counts.completed ?? 0, view: "completed" },
            { key: "overdue", label: "Overdue", value: counts.overdue ?? 0, view: "overdue" },
          ]
        : tab === "team"
          ? [
              { key: "open", label: "Open", value: counts.open ?? 0 },
              { key: "awaitingAcknowledgement", label: "Awaiting Acknowledgement", value: counts.awaitingAcknowledgement ?? 0 },
              { key: "dueToday", label: "Due Today", value: counts.dueToday ?? 0, view: "today" },
              { key: "overdue", label: "Overdue", value: counts.overdue ?? 0, view: "overdue" },
              { key: "completed", label: "Completed", value: counts.completed ?? 0, view: "completed" },
            ]
          : [
              { key: "needsAction", label: "Needs Action", value: counts.needsAction ?? 0, view: "needs_action" },
              { key: "today", label: "Today", value: counts.today ?? 0, view: "today" },
              { key: "overdue", label: "Overdue", value: counts.overdue ?? 0, view: "overdue" },
              { key: "inProgress", label: "In Progress", value: counts.inProgress ?? 0, view: "in_progress" },
              { key: "completed", label: "Completed", value: counts.completed ?? 0, view: "completed" },
            ];

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "mine", label: "My Tasks" },
    { id: "todo", label: "My To-Do" },
    { id: "assigned", label: "Assigned By Me" },
    ...(canViewTeam ? [{ id: "team" as const, label: "Team Tasks" }] : []),
    ...(canViewAll ? [{ id: "all" as const, label: "All Tasks" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">Assign, acknowledge, follow up, and complete work.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New task</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === item.id ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setView(card.view && view !== card.view ? card.view : "")}
            className="text-left"
          >
            <Card className={view === card.view ? "border-emerald-400" : undefined}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search title or description"
          className="max-w-xs"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">All statuses</option>
          {Object.values(TaskStatus).map((value) => (
            <option key={value} value={value}>
              {TASK_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">All priorities</option>
          {Object.values(TaskPriority).map((value) => (
            <option key={value} value={value}>
              {TASK_PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={overdue} onChange={(event) => setOverdue(event.target.checked)} />
          Overdue only
        </label>
      </div>

      {tab === "team" && data?.employeeSummary?.length ? (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Employee summary</p>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2">Employee</th>
                    <th className="pb-2">Open</th>
                    <th className="pb-2">Due today</th>
                    <th className="pb-2">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employeeSummary.map((row) => (
                    <tr key={row.employeeId} className="border-t border-slate-100">
                      <td className="py-2">{row.employeeName}</td>
                      <td>{row.open}</td>
                      <td>{row.dueToday}</td>
                      <td>{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading tasks…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : (
          <TaskListTable
            items={data?.items ?? []}
            sourceLabel={tab === "assigned" || tab === "team" || tab === "all" ? "Assigned to" : "Assigned by"}
          />
        )}
      </Card>

      {createOpen ? (
        <TaskCreateDialog
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
