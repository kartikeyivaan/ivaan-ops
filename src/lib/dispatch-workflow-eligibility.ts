import { DispatchStatus } from "@prisma/client";

/** Only fully dispatched (non-cancelled) DCs may enter invoice, DCR, or other post-dispatch workflows. */
export function isDispatchEligibleForDownstreamProcessing(
  status: DispatchStatus | string,
): boolean {
  return status === DispatchStatus.DISPATCHED;
}

export function assertDispatchEligibleForDownstreamProcessing(
  status: DispatchStatus | string,
): void {
  if (status === DispatchStatus.CANCELLED) {
    throw new Error("DISPATCH_CANCELLED");
  }
  if (!isDispatchEligibleForDownstreamProcessing(status)) {
    throw new Error("DISPATCH_NOT_ELIGIBLE");
  }
}

export const dispatchEligibleForDownstreamWhere = {
  status: DispatchStatus.DISPATCHED,
} as const;
