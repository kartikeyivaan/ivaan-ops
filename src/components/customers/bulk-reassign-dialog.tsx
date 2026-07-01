"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
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
    <Modal onClose={onClose} size="sm">
      <ModalHeader title="Bulk Reassign" onClose={onClose} />
      <ModalBody className="space-y-4">
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
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button onClick={handleSubmit} disabled={loading || !assignedSalesUserId}>
          {loading ? "Saving..." : "Reassign customers"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
