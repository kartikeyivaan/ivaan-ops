"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import type { SerializedProject } from "@/lib/project-service";

export function ProjectCloseDialog({
  projectId,
  projectNo,
  open,
  onOpenChange,
  onClosed,
}: {
  projectId: string;
  projectNo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: (project: SerializedProject) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmClose() {
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/projects/${projectId}/close`, { method: "POST" });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to close project.");
      return;
    }

    onOpenChange(false);
    onClosed(data as SerializedProject);
  }

  if (!open) return null;

  return (
    <Modal onClose={() => onOpenChange(false)} size="sm">
      <ModalHeader title="Close Project" onClose={() => onOpenChange(false)} />
      <ModalBody className="space-y-3">
        <p className="text-sm text-slate-600">
          Close <span className="font-medium text-slate-900">{projectNo}</span>? This will cancel
          any draft project dispatches and auto-return unused stock from Jalgaon Projects to the
          original source warehouses.
        </p>
        <p className="text-sm text-slate-500">
          After close, material assignment becomes read-only and new dispatches are blocked.
        </p>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" disabled={loading} onClick={() => void confirmClose()}>
          {loading ? "Closing…" : "Close Project"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
