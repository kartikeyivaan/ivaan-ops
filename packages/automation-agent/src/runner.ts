import { AGENT_VERSION, PORTAL_ORDER, type PortalCode } from "./constants.js";
import { CloudClient } from "./cloud-client.js";
import type { AgentConfig } from "./config.js";
import { BrowserManager, type BrowserManagerOptions } from "./browser-manager.js";
import { runShareDcrStubWorkflow } from "./workflows/share-dcr-stub.js";

const HEARTBEAT_MS = 30_000;
const IDLE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AgentLoopHooks = {
  onHeartbeat?: (ok: boolean) => void;
  shouldStop?: () => boolean;
};

export type RunAgentLoopOptions = {
  hooks?: AgentLoopHooks;
  browser?: BrowserManagerOptions;
};

function portalsForStrategy(strategy: string): PortalCode[] {
  const order = PORTAL_ORDER[strategy];
  if (!order) throw new Error(`Unknown portal strategy: ${strategy}`);
  return order;
}

export async function runAgentLoop(
  config: AgentConfig,
  options: RunAgentLoopOptions = {},
): Promise<void> {
  const client = new CloudClient(config);
  const browser = new BrowserManager(config, options.browser);
  const hooks = options.hooks;
  let lastHeartbeat = 0;

  console.log(`Ivaan Ops Automation Agent v${AGENT_VERSION}`);
  console.log(`Cloud: ${config.baseUrl}`);
  console.log("Waiting for runs started in Ivaan Ops…\n");

  try {
    while (!hooks?.shouldStop?.()) {
      const now = Date.now();
      if (now - lastHeartbeat >= HEARTBEAT_MS) {
        try {
          await client.heartbeat(AGENT_VERSION);
          hooks?.onHeartbeat?.(true);
        } catch {
          hooks?.onHeartbeat?.(false);
        }
        lastHeartbeat = now;
      }

      const claim = await client.claim();
      if (!claim.execution) {
        await sleep(IDLE_MS);
        continue;
      }

      const execution = claim.execution;
      console.log(
        `Run ${execution.id} — ${execution.progressDone}/${execution.progressTotal} — strategy ${execution.portalStrategy}`,
      );

      await processExecution(client, browser, config, execution.id, execution.portalStrategy);

      console.log(`Run ${execution.id} pass complete (check cloud for remaining portal retries).\n`);
      await browser.closeAll();
    }
  } finally {
    await browser.closeAll();
  }
}

async function processExecution(
  client: CloudClient,
  browser: BrowserManager,
  config: AgentConfig,
  executionId: string,
  portalStrategy: string,
): Promise<void> {
  const portalOrder = portalsForStrategy(portalStrategy);
  const loginReady = new Set<PortalCode>();

  while (true) {
    const pending = await client.pendingAttempts(executionId);
    if (!pending.length) break;

    for (const portal of portalOrder) {
      const portalAttempts = pending.filter((a) => a.portal === portal);
      if (!portalAttempts.length) continue;

      if (!loginReady.has(portal)) {
        await browser.openPortal(portal);
        loginReady.add(portal);
      }

      const context = browser.getContext(portal);

      for (const attempt of portalAttempts) {
        try {
          const result = await runShareDcrStubWorkflow(context, attempt, config);
          await client.completeAttempt(attempt.id, result);
          console.log(`  Attempt ${attempt.id}: ${result.status}`);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Unknown agent error";
          await client.completeAttempt(attempt.id, {
            status: "FAILED",
            errorMessage: message,
            workflowStep: "AGENT_ERROR",
          });
          console.error(`  Attempt ${attempt.id} error:`, message);
        }
      }
    }
  }
}
