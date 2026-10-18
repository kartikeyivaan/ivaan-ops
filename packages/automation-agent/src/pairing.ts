import { AGENT_VERSION } from "./constants.js";
import { defaultPortalUrls, saveConfig } from "./config.js";
import { CloudClient } from "./cloud-client.js";

export async function pairDevice(input: {
  pairingCode: string;
  baseUrl: string;
  label?: string;
}): Promise<void> {
  const code = input.pairingCode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Pairing code must be 6 digits.");
  }

  const baseUrl = input.baseUrl.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Ivaan Ops URL is required.");
  }

  const tempClient = new CloudClient({
    baseUrl,
    deviceId: "pending",
    deviceSecret: "pending",
  });

  const registered = await tempClient.register({
    pairingCode: code,
    label: input.label,
    agentVersion: AGENT_VERSION,
  });

  await saveConfig({
    baseUrl,
    deviceId: registered.deviceId,
    deviceSecret: registered.deviceSecret,
    label: input.label,
    portals: defaultPortalUrls(),
    stubMode: "success",
  });
}
