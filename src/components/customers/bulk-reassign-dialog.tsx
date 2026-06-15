"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type SalesExecutive = { id: string; name: string; email: string };

export function BulkReassignDialog({
  customerIds,
  salesExecutives,
  onClose,
  onReassigned,
}: {
  customerIds: string[];
  salesExecutives: SalesExecutive[];
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [assignedSalesUserId, setAssignedSalesUserId] = useState(
    salesExecutives[0]?.id ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/customers/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerIds, assignedSalesUserId }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Reassignment failed.");
      return;
    }

    setMessage(`Reassigned ${data.updatedCount} customers.`);
    onReassigned();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bulk Reassign</CardTitle>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Reassign {customerIds.length} selected customers to a new sales executive.
          </p>
          <div className="space-y-2">
            <Label htmlFor="assignee">Sales Executive</Label>
            <select
              id="assignee"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={assignedSalesUserId}
              onChange={(e) => setAssignedSalesUserId(e.target.value)}
            >
              {salesExecutives.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleSubmit} disabled={loading || !assignedSalesUserId}>
            {loading ? "Saving..." : "Reassign customers"}
          </Button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
