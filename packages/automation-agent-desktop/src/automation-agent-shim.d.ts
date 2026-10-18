declare module "@ivaan/automation-agent/dist/config.js" {
  export type AgentConfig = {
    baseUrl: string;
    deviceId: string;
    deviceSecret: string;
    label?: string;
    portals?: Partial<Record<"PCMV" | "ISE", string>>;
    stubMode?: "success" | "fail";
  };
  export function loadConfigResolved(): Promise<AgentConfig | null>;
}

declare module "@ivaan/automation-agent/dist/pairing.js" {
  export function pairDevice(input: {
    pairingCode: string;
    baseUrl: string;
    label?: string;
  }): Promise<void>;
}

declare module "@ivaan/automation-agent/dist/playwright-env.js" {
  export function applyBundledPlaywrightEnv(): void;
}

declare module "@ivaan/automation-agent/dist/runner.js" {
  import type { AgentConfig } from "@ivaan/automation-agent/dist/config.js";
  import type { PortalCode } from "@ivaan/automation-agent/dist/constants.js";

  export type AgentLoopHooks = {
    onHeartbeat?: (ok: boolean) => void;
    shouldStop?: () => boolean;
  };

  export type RunAgentLoopOptions = {
    hooks?: AgentLoopHooks;
    browser?: {
      waitForLogin?: (portal: PortalCode) => Promise<void>;
    };
  };

  export function runAgentLoop(config: AgentConfig, options?: RunAgentLoopOptions): Promise<void>;
}

declare module "@ivaan/automation-agent/dist/constants.js" {
  export const AGENT_VERSION: string;
  export const DEFAULT_IVAAN_OPS_BASE_URL: string;
  export type PortalCode = "PCMV" | "ISE";
}
