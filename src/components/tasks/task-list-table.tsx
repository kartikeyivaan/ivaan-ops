"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaskDueLabel } from "@/lib/task-overdue";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  taskPriorityVariant,
  taskStatusVariant,
} from "@/lib/task-display";

export type TaskListItem = {
  id: string;
  title: string;
  taskType: "ASSIGNED" | "SELF" | "SYSTEM";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "PENDING_ACKNOWLEDGEMENT" | "ACKNOWLEDGED" | "TO_DO" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  dueDate: string | null;
  dueTime: string | null;
  isOverdue: boolean;
  isDueToday: boolean;
  createdBy: { id: string; name: string } | null;
  assignedTo: { id: string; name: string };
  linkedRecord: { label: string; href: string; type: string } | null;
};

function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className ?? "px-4 py-3 align-middle"} {...props} />;
}

export function TaskListTable({
  items,
  sourceLabel = "Assigned by",
}: {
  items: TaskListItem[];
  sourceLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-sm text-slate-500">No tasks match this view.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Priority</TableHead>
          <TableHead>Task</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>{sourceLabel}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Linked record</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <Badge variant={taskPriorityVariant(task.priority)}>
                {TASK_PRIORITY_LABELS[task.priority]}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <Link href={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:underline">
                  {task.title}
                </Link>
                <div>
                  <Badge>{TASK_TYPE_LABELS[task.taskType]}</Badge>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <p>{formatTaskDueLabel(task.dueDate, task.dueTime) ?? "—"}</p>
                {task.isOverdue ? <Badge variant="danger">Overdue</Badge> : null}
                {!task.isOverdue && task.isDueToday ? <Badge variant="warning">Due today</Badge> : null}
              </div>
            </TableCell>
            <TableCell>
              {task.taskType === "SYSTEM"
                ? "System"
                : sourceLabel === "Assigned to"
                  ? task.assignedTo.name
                  : task.createdBy?.name ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={taskStatusVariant(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
            </TableCell>
            <TableCell>
              {task.linkedRecord ? (
                <Link href={task.linkedRecord.href} className="text-emerald-700 hover:underline">
                  {task.linkedRecord.label}
                </Link>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-emerald-700 hover:underline">
                Open
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
