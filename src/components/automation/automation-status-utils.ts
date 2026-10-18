export function automationStatusBadgeVariant(
  status: string,
): "default" | "success" | "warning" | "danger" {
  if (status === "DCR_ISSUED" || status === "SUCCEEDED" || status === "COMPLETED") return "success";
  if (status === "FAILED" || status === "REQUIRES_MANUAL" || status === "CANCELLED") return "danger";
  if (
    status === "PROCESSING"
    || status === "RUNNING"
    || status === "REQUIRES_ATTENTION"
    || status === "PENDING"
  ) {
    return "warning";
  }
  return "default";
}

export function formatAutomationStatus(status: string) {
  return status.replaceAll("_", " ");
}
