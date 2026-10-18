import type { AgentConfig } from "./config.js";

export type ClaimResponse = {
  execution: {
    id: string;
    status: string;
    portalStrategy: string;
    includeEarlyDcr: boolean;
    progressDone: number;
    progressTotal: number;
  } | null;
  attempts: PortalAttempt[];
};

export type PortalAttempt = {
  id: string;
  portal: "PCMV" | "ISE";
  queueItem: {
    dispatch: {
      dcNo: string;
      proformaInvoice: { piNo: string };
      customer: { customerName: string; gstNumber: string | null };
    };
    dispatchLine: {
      product: { displayName: string };
      serials: { serial: { serialNumber: string } }[];
    };
  };
};

export class CloudClient {
  constructor(private config: AgentConfig) {}

  private authHeader(): string {
    return `Bearer ${this.config.deviceId}.${this.config.deviceSecret}`;
  }

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async register(input: {
    pairingCode: string;
    label?: string;
    agentVersion: string;
  }): Promise<{ deviceId: string; deviceSecret: string }> {
    const response = await fetch(this.url("/api/automation/agent/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Registration failed.");
    return { deviceId: data.deviceId, deviceSecret: data.deviceSecret };
  }

  async heartbeat(agentVersion: string): Promise<void> {
    const response = await fetch(this.url("/api/automation/agent/heartbeat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: JSON.stringify({ agentVersion }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? "Heartbeat failed.");
    }
  }

  async claim(): Promise<ClaimResponse> {
    const response = await fetch(this.url("/api/automation/agent/executions/claim"), {
      method: "POST",
      headers: { Authorization: this.authHeader() },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Claim failed.");
    return data as ClaimResponse;
  }

  async pendingAttempts(executionId: string): Promise<PortalAttempt[]> {
    const response = await fetch(
      this.url(`/api/automation/agent/executions/${executionId}/pending-attempts`),
      { headers: { Authorization: this.authHeader() } },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Unable to load pending attempts.");
    return data.attempts as PortalAttempt[];
  }

  async completeAttempt(
    attemptId: string,
    result: {
      status: "SUCCEEDED" | "FAILED";
      externalDcrNumber?: string;
      externalPortalStatus?: string;
      errorMessage?: string;
      workflowStep?: string;
    },
  ): Promise<void> {
    const response = await fetch(this.url(`/api/automation/agent/attempts/${attemptId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: JSON.stringify(result),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Unable to report attempt result.");
  }
}
