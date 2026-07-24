import type {
  ServiceContactMode,
  ServiceStatus,
  ServiceUpdateType,
  ServiceVisitStatus,
  ServiceWaitingReason,
} from "@prisma/client";
import {
  SERVICE_CONTACT_MODE_LABELS,
  SERVICE_STATUS_LABELS,
  SERVICE_UPDATE_TYPE_LABELS,
  SERVICE_VISIT_STATUS_LABELS,
  SERVICE_WAITING_REASON_LABELS,
} from "@/lib/service";
import { formatDate, formatDocumentDate } from "@/lib/utils";

export type ServiceTimelineEntry = {
  id: string;
  updateType: ServiceUpdateType;
  note: string | null;
  oldStatus: ServiceStatus | null;
  newStatus: ServiceStatus | null;
  waitingReason: ServiceWaitingReason | null;
  nextActionDate: string | null;
  visitDate: string | null;
  visitTime: string | null;
  visitStatus: ServiceVisitStatus | null;
  visitResult: string | null;
  contactMode: ServiceContactMode | null;
  materialDetails: string | null;
  furtherWorkRequired: boolean | null;
  assignedExecutive: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  attachments: { id: string; fileUrl: string; fileName: string | null }[];
};

function entryDetail(entry: ServiceTimelineEntry): string | null {
  switch (entry.updateType) {
    case "STATUS_CHANGE": {
      const from = entry.oldStatus ? SERVICE_STATUS_LABELS[entry.oldStatus] : null;
      const to = entry.newStatus ? SERVICE_STATUS_LABELS[entry.newStatus] : null;
      const base = from && to ? `${from} → ${to}` : to ? `Set to ${to}` : null;
      if (entry.waitingReason) {
        return `${base ?? ""} · ${SERVICE_WAITING_REASON_LABELS[entry.waitingReason]}`.trim();
      }
      return base;
    }
    case "ASSIGNMENT":
      return entry.assignedExecutive
        ? `Assigned to ${entry.assignedExecutive.name}`
        : "Unassigned";
    case "CUSTOMER_CONTACTED":
      return entry.contactMode
        ? `Contacted via ${SERVICE_CONTACT_MODE_LABELS[entry.contactMode]}`
        : null;
    case "VISIT_SCHEDULED": {
      const parts: string[] = [];
      if (entry.visitDate) parts.push(formatDocumentDate(entry.visitDate));
      if (entry.visitTime) parts.push(entry.visitTime);
      if (entry.assignedExecutive) parts.push(entry.assignedExecutive.name);
      return parts.length ? parts.join(" · ") : null;
    }
    case "SITE_VISIT_COMPLETED": {
      const parts: string[] = [];
      if (entry.visitStatus) parts.push(SERVICE_VISIT_STATUS_LABELS[entry.visitStatus]);
      if (entry.visitResult) parts.push(entry.visitResult);
      if (entry.furtherWorkRequired) parts.push("Further work required");
      return parts.length ? parts.join(" · ") : null;
    }
    case "MATERIAL_REQUIRED":
      return entry.materialDetails;
    default:
      return null;
  }
}

export function ServiceTimeline({ entries }: { entries: ServiceTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => {
        const detail = entryDetail(entry);
        return (
          <li key={entry.id} className="relative pl-6">
            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="absolute left-[4px] top-4 h-full w-px bg-slate-200 last:hidden" />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {SERVICE_UPDATE_TYPE_LABELS[entry.updateType]}
              </p>
              <p className="text-xs text-slate-400">{formatDate(entry.createdAt)}</p>
            </div>
            {detail ? <p className="text-sm text-slate-700">{detail}</p> : null}
            {entry.note ? (
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{entry.note}</p>
            ) : null}
            {entry.nextActionDate ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Next action: {formatDocumentDate(entry.nextActionDate)}
              </p>
            ) : null}
            {entry.attachments.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {entry.attachments.map((att) => (
                  <li key={att.id}>
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 underline"
                    >
                      {att.fileName ?? att.fileUrl}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-0.5 text-xs text-slate-400">by {entry.createdBy?.name ?? "System"}</p>
          </li>
        );
      })}
    </ol>
  );
}
