import type { CustomerRefundStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export type BadgeVariant = "default" | "success" | "warning" | "danger";

export function refundStatusVariant(status: CustomerRefundStatus): BadgeVariant {
  if (status === "REFUNDED") return "success";
  if (status === "REJECTED" || status === "CANCELLED" || status === "FAILED") {
    return "danger";
  }
  if (status === "PENDING_APPROVAL" || status === "PROCESSING" || status === "APPROVED") {
    return "warning";
  }
  return "default";
}

export function RefundStatusBadge({
  status,
  label,
}: {
  status: CustomerRefundStatus;
  label: string;
}) {
  return <Badge variant={refundStatusVariant(status)}>{label}</Badge>;
}

export function formatRefundAmount(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatRefundDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN");
}

export function formatRefundDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN");
}

/** Label/value pair used across the summary cards. */
export function DetailField({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
