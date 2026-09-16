"use client";

import { useEffect, useState } from "react";
import { TaskPriority } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { formatApiErrorMessage } from "@/lib/api-response";
import { LINKED_RECORD_LABELS } from "@/lib/task-linked-record";
import { TASK_PRIORITY_LABELS } from "@/lib/task-display";

type Assignee = { id: string; name: string; email: string };

export function TaskCreateDialog({
  currentUserId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignTo, setAssignTo] = useState("myself");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.NORMAL);
  const [linkedType, setLinkedType] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tasks/assignees")
      .then((response) => response.json())
      .then((data) => setAssignees(Array.isArray(data) ? data : []))
      .catch(() => setAssignees([]));
  }, []);

  const isSelf = assignTo === "myself";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title,
      description,
      assignToSelf: isSelf,
      assignedToId: isSelf ? undefined : assignTo,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      priority,
      linkedRecordType: linkedType || undefined,
      linkedRecordId: linkedId || undefined,
    };
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(formatApiErrorMessage(body, "Could not create the task."));
      setSaving(false);
      return;
    }
    onCreated();
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalForm onSubmit={onSubmit}>
        <ModalHeader title="New task" description="Assign work or add a private to-do." onClose={onClose} />
        <ModalBody className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Task title</Label>
            <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-assign">Assign to</Label>
              <select
                id="task-assign"
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="myself">Myself</option>
                {assignees
                  .filter((user) => user.id !== currentUserId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {Object.values(TaskPriority).map((value) => (
                  <option key={value} value={value}>
                    {TASK_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Due date{isSelf ? " (optional)" : ""}</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required={!isSelf}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due-time">Due time (optional)</Label>
              <Input
                id="task-due-time"
                type="time"
                value={dueTime}
                onChange={(event) => setDueTime(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-link-type">Linked record (optional)</Label>
              <select
                id="task-link-type"
                value={linkedType}
                onChange={(event) => setLinkedType(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">None</option>
                {Object.entries(LINKED_RECORD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-link-id">Record ID</Label>
              <Input
                id="task-link-id"
                value={linkedId}
                onChange={(event) => setLinkedId(event.target.value)}
                disabled={!linkedType}
                placeholder="Paste record ID"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create task"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
