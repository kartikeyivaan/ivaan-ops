import type { BrowserContext } from "playwright";
import type { AgentConfig } from "../config.js";
import type { PortalAttempt } from "../cloud-client.js";

export type StubResult = {
  status: "SUCCEEDED" | "FAILED";
  externalDcrNumber?: string;
  externalPortalStatus?: string;
  errorMessage?: string;
  workflowStep: string;
};

/**
 * Placeholder until government portal steps are defined.
 * Opens no extra UI — assumes user session is ready on the active portal page.
 */
export async function runShareDcrStubWorkflow(
  _context: BrowserContext,
  attempt: PortalAttempt,
  config: AgentConfig,
): Promise<StubResult> {
  const pi = attempt.queueItem.dispatch.proformaInvoice.piNo;
  const dc = attempt.queueItem.dispatch.dcNo;
  const product = attempt.queueItem.dispatchLine.product.displayName;

  console.log(`  Stub processing: ${pi} / ${dc} / ${product}`);

  if (config.stubMode === "fail") {
    return {
      status: "FAILED",
      errorMessage: "Stub workflow forced failure (stubMode=fail).",
      workflowStep: "STUB_FAIL",
    };
  }

  const suffix = attempt.id.replace(/-/g, "").slice(0, 10).toUpperCase();
  return {
    status: "SUCCEEDED",
    externalDcrNumber: `STUB-DCR-${suffix}`,
    externalPortalStatus: "STUB_ISSUED",
    workflowStep: "STUB_SUCCESS",
  };
}
