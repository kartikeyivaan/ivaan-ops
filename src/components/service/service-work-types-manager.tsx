"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiErrorMessage, parseApiJson, type ApiErrorPayload } from "@/lib/api-response";

export type WorkType = {
  id: string;
  name: string;
  defaultTargetDays: number | null;
  isActive: boolean;
  displayOrder: number;
};

export function ServiceWorkTypesManager({ initialWorkTypes }: { initialWorkTypes: WorkType[] }) {
  const [workTypes, setWorkTypes] = useState<WorkType[]>(initialWorkTypes);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState("");
  const [adding, setAdding] = useState(false);

  async function reload() {
    try {
      const response = await fetch("/api/service/work-types?includeInactive=true");
      if (!response.ok) return;
      const data = await parseApiJson<WorkType[]>(response);
      setWorkTypes(Array.isArray(data) ? data : []);
    } catch {
      // keep the current list on transient errors
    }
  }

  function setField(id: string, field: keyof WorkType, value: WorkType[keyof WorkType]) {
    setWorkTypes((current) =>
      current.map((wt) => (wt.id === id ? { ...wt, [field]: value } : wt)),
    );
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) {
      setError("Enter a work type name.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/service/work-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          defaultTargetDays: newDays.trim() ? Number(newDays) : null,
          isActive: true,
        }),
      });
      const data = await parseApiJson<ApiErrorPayload>(response);
      if (!response.ok) {
        setError(formatApiErrorMessage(data, "Failed to add work type."));
        return;
      }
      setNewName("");
      setNewDays("");
      await reload();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/service/work-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<ApiErrorPayload>(response);
      if (!response.ok) {
        setError(formatApiErrorMessage(data, "Failed to update work type."));
        return false;
      }
      await reload();
      return true;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function saveRow(wt: WorkType) {
    if (!wt.name.trim()) {
      setError("Work type name is required.");
      return;
    }
    await patch(wt.id, {
      name: wt.name.trim(),
      defaultTargetDays: wt.defaultTargetDays,
    });
  }

  async function reorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= workTypes.length) return;
    const next = [...workTypes];
    [next[index], next[target]] = [next[target], next[index]];
    setWorkTypes(next);
    setBusyId("reorder");
    setError(null);
    try {
      const response = await fetch("/api/service/work-types/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((wt) => wt.id) }),
      });
      if (!response.ok) {
        setError("Failed to reorder work types.");
      }
      await reload();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Service Work Types</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Work Type</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-[1fr,180px,auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="newName">Name</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Panel Cleaning"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newDays">Default Target Days</Label>
              <Input
                id="newDays"
                inputMode="numeric"
                value={newDays}
                onChange={(e) => setNewDays(e.target.value.replace(/\D/g, ""))}
                placeholder="Optional"
              />
            </div>
            <Button type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="p-2">
          <div className="space-y-2">
            {workTypes.map((wt, index) => (
              <div
                key={wt.id}
                className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Order</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      aria-label="Move up"
                      disabled={index === 0 || busyId !== null}
                      onClick={() => reorder(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      aria-label="Move down"
                      disabled={index === workTypes.length - 1 || busyId !== null}
                      onClick={() => reorder(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="min-w-[180px] flex-1 space-y-1">
                  <span className="text-xs text-slate-400">Name</span>
                  <Input
                    value={wt.name}
                    onChange={(e) => setField(wt.id, "name", e.target.value)}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <span className="text-xs text-slate-400">Target Days</span>
                  <Input
                    inputMode="numeric"
                    value={wt.defaultTargetDays ?? ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setField(wt.id, "defaultTargetDays", digits ? Number(digits) : null);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  {wt.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge>Inactive</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => saveRow(wt)}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => patch(wt.id, { isActive: !wt.isActive })}
                  >
                    {wt.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
            {workTypes.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No work types yet. Add one above.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
