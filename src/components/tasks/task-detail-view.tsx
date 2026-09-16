"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TaskActivityType, TaskReassignmentRequestStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { formatApiErrorMessage } from "@/lib/api-response";
import {
  TASK_ACTIVITY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  taskPriorityVariant,
  taskStatusVariant,
} from "@/lib/task-display";
import { formatTaskDueLabel } from "@/lib/task-overdue";
import { formatDate } from "@/lib/utils";

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  taskType: "ASSIGNED" | "SELF" | "SYSTEM";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "PENDING_ACKNOWLEDGEMENT" | "ACKNOWLEDGED" | "TO_DO" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  dueDate: string | null;
  dueTime: string | null;
  isOverdue: boolean;
  isDueToday: boolean;
  systemTriggerReason: string | null;
  completionNote: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  createdBy: { id: string; name: string } | null;
  assignedTo: { id: string; name: string };
  linkedRecord: { label: string; href: string; type: string } | null;
  comments: Array<{ id: string; comment: string; createdAt: string; user: { id: string; name: string } }>;
  activities: Array<{
    id: string;
    activityType: TaskActivityType;
    createdAt: string;
    metadata: Record<string, unknown> | null;
    actor: { id: string; name: string } | null;
  }>;
  reassignmentRequests: Array<{
    id: string;
    reason: string;
    status: TaskReassignmentRequestStatus;
    requestedToId: string | null;
    requestedBy: { id: string; name: string };
  }>;
};

type Assignee = { id: string; name: string };

export function TaskDetailView({
  taskId,
  currentUserId,
  canManageTeam,
}: {
  taskId: string;
  currentUserId: string;
  canManageTeam: boolean;
}) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [prompt, setPrompt] = useState<
    | { kind: "complete" }
    | { kind: "reject" }
    | { kind: "cancel" }
    | { kind: "reassign" }
    | { kind: "request" }
    | { kind: "decide"; requestId: string }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks/${taskId}`);
    if (!response.ok) {
      setError("Task not found or you do not have access.");
      setTask(null);
      return;
    }
    setTask(await response.json());
    setError(null);
  }, [taskId]);

  useEffect(() => {
    void load();
    fetch("/api/tasks/assignees")
      .then((response) => response.json())
      .then((data) => setAssignees(Array.isArray(data) ? data : []))
      .catch(() => setAssignees([]));
  }, [load, taskId]);

  async function post(path: string, body?: unknown) {
    setSaving(true);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(formatApiErrorMessage(payload, "The action could not be completed."));
      setSaving(false);
      return false;
    }
    setSaving(false);
    setPrompt(null);
    setReason("");
    setAssigneeId("");
    await load();
    router.refresh();
    return true;
  }

  if (error && !task) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!task) {
    return <p className="text-sm text-slate-500">Loading task…</p>;
  }

  const isAssignee = task.assignedTo.id === currentUserId;
  const isAssigner = task.createdBy?.id === currentUserId;
  const isSelf = task.taskType === "SELF";
  const status = String(task.status);
  const isClosed = ["COMPLETED", "CANCELLED", "REJECTED"].includes(status);
  const canAck = isAssignee && status === "PENDING_ACKNOWLEDGEMENT" && !isSelf;
  const canStart = isAssignee && (status === "ACKNOWLEDGED" || (isSelf && status === "TO_DO"));
  const canComplete =
    isAssignee && ["ACKNOWLEDGED", "IN_PROGRESS", "TO_DO"].includes(status) && (isSelf || status !== "TO_DO");
  const canCancel = !isClosed && ((isSelf && isAssignee) || (!isSelf && (isAssigner || canManageTeam)));
  const canReassign = !isSelf && (isAssigner || canManageTeam) && !isClosed;
  const canRequest = !isSelf && isAssignee && !isAssigner && !isClosed;
  const pendingRequest = task.reassignmentRequests.find(
    (item) => item.status === "PENDING",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tasks" className="text-sm font-medium text-emerald-700 hover:underline">
          ← Back to tasks
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">{task.title}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge>{TASK_TYPE_LABELS[task.taskType]}</Badge>
              <Badge variant={taskStatusVariant(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
              <Badge variant={taskPriorityVariant(task.priority)}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
              {task.isOverdue ? <Badge variant="danger">Overdue</Badge> : null}
              {!task.isOverdue && task.isDueToday ? <Badge variant="warning">Due today</Badge> : null}
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Due</p>
            <p className="text-sm text-slate-900">{formatTaskDueLabel(task.dueDate, task.dueTime) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Assigner</p>
            <p className="text-sm text-slate-900">
              {task.taskType === "SYSTEM" ? "System" : task.createdBy?.name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Assignee</p>
            <p className="text-sm text-slate-900">{task.assignedTo.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Linked record</p>
            {task.linkedRecord ? (
              <Link href={task.linkedRecord.href} className="text-sm font-medium text-emerald-700 hover:underline">
                Open record · {task.linkedRecord.label}
              </Link>
            ) : (
              <p className="text-sm text-slate-900">None</p>
            )}
          </div>
          {task.systemTriggerReason ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">System reason</p>
              <p className="text-sm text-slate-900">{task.systemTriggerReason}</p>
            </div>
          ) : null}
          {task.description ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Description</p>
              <p className="whitespace-pre-wrap text-sm text-slate-900">{task.description}</p>
            </div>
          ) : null}
          {task.completionNote ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Completion note</p>
              <p className="text-sm text-slate-900">{task.completionNote}</p>
            </div>
          ) : null}
          {task.rejectionReason ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Rejection reason</p>
              <p className="text-sm text-slate-900">{task.rejectionReason}</p>
            </div>
          ) : null}
          {task.cancellationReason ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Cancellation reason</p>
              <p className="text-sm text-slate-900">{task.cancellationReason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canAck ? (
          <>
            <Button onClick={() => void post(`/api/tasks/${task.id}/acknowledge`)}>Acknowledge</Button>
            <Button variant="outline" onClick={() => setPrompt({ kind: "reject" })}>
              Reject
            </Button>
          </>
        ) : null}
        {canStart ? (
          <Button variant="secondary" onClick={() => void post(`/api/tasks/${task.id}/start`)}>
            Start
          </Button>
        ) : null}
        {canComplete ? (
          <Button onClick={() => setPrompt({ kind: "complete" })}>Complete</Button>
        ) : null}
        {canReassign ? (
          <Button variant="outline" onClick={() => setPrompt({ kind: "reassign" })}>
            Reassign
          </Button>
        ) : null}
        {canRequest ? (
          <Button variant="outline" onClick={() => setPrompt({ kind: "request" })}>
            Request reassignment
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="destructive" onClick={() => setPrompt({ kind: "cancel" })}>
            Cancel task
          </Button>
        ) : null}
      </div>

      {pendingRequest && (isAssigner || canManageTeam) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reassignment request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              {pendingRequest.requestedBy.name}: {pendingRequest.reason}
            </p>
            <Button size="sm" onClick={() => setPrompt({ kind: "decide", requestId: pendingRequest.id })}>
              Review request
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity / conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {task.activities.map((item) => (
              <div key={item.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="text-sm text-slate-900">
                  {formatDate(item.createdAt)} — {item.actor?.name ?? "System"}{" "}
                  {TASK_ACTIVITY_LABELS[item.activityType]}
                </p>
                {item.activityType === "COMMENT_ADDED" && item.metadata?.comment ? (
                  <p className="mt-1 text-sm text-slate-600">{String(item.metadata.comment)}</p>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!comment.trim()) return;
              const ok = await post(`/api/tasks/${task.id}/comments`, { comment });
              if (ok) setComment("");
            }}
          >
            <Label htmlFor="task-comment">Add comment</Label>
            <textarea
              id="task-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <Button type="submit" size="sm" disabled={saving || !comment.trim()}>
              Add comment
            </Button>
          </form>
        </CardContent>
      </Card>

      {prompt ? (
        <Modal onClose={() => setPrompt(null)} size="md">
          <ModalForm
            onSubmit={(event) => {
              event.preventDefault();
              if (prompt.kind === "complete") {
                void post(`/api/tasks/${task.id}/complete`, { note: reason });
              } else if (prompt.kind === "reject") {
                void post(`/api/tasks/${task.id}/reject`, { reason });
              } else if (prompt.kind === "cancel") {
                void post(`/api/tasks/${task.id}/cancel`, { reason });
              } else if (prompt.kind === "reassign") {
                void post(`/api/tasks/${task.id}/reassign`, { assignedToId: assigneeId, reason });
              } else if (prompt.kind === "request") {
                void post(`/api/tasks/${task.id}/reassignment-requests`, {
                  reason,
                  requestedToId: assigneeId || undefined,
                });
              } else if (prompt.kind === "decide") {
                void post(`/api/tasks/${task.id}/reassignment-requests/${prompt.requestId}/decide`, {
                  decision: reason === "REJECT" ? "REJECT" : "APPROVE",
                  assignedToId: assigneeId || undefined,
                });
              }
            }}
          >
            <ModalHeader
              title={
                prompt.kind === "complete"
                  ? "Complete task"
                  : prompt.kind === "reject"
                    ? "Reject task"
                    : prompt.kind === "cancel"
                      ? "Cancel task"
                      : prompt.kind === "reassign"
                        ? "Reassign task"
                        : prompt.kind === "request"
                          ? "Request reassignment"
                          : "Review reassignment"
              }
              onClose={() => setPrompt(null)}
            />
            <ModalBody className="space-y-3">
              {prompt.kind === "reassign" || prompt.kind === "request" || prompt.kind === "decide" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="reassign-user">
                    {prompt.kind === "request" ? "Suggested assignee (optional)" : "Assign to"}
                  </Label>
                  <select
                    id="reassign-user"
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    required={prompt.kind === "reassign"}
                  >
                    <option value="">Select employee</option>
                    {assignees
                      .filter((user) => user.id !== task.assignedTo.id)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              {prompt.kind === "decide" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="decision">Decision</Label>
                  <select
                    id="decision"
                    value={reason || "APPROVE"}
                    onChange={(event) => setReason(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Decline</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="reason">
                    {prompt.kind === "complete" ? "Completion note (optional)" : "Reason"}
                  </Label>
                  <Input
                    id="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    required={prompt.kind !== "complete"}
                  />
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setPrompt(null)}>
                Close
              </Button>
              <Button type="submit" disabled={saving}>
                Confirm
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}
    </div>
  );
}
