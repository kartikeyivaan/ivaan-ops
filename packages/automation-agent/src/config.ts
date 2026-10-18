import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { DCR_PORTAL_LOGIN_URL } from "./constants.js";

export type AgentConfig = {
  baseUrl: string;
  deviceId: string;
  deviceSecret: string;
  label?: string;
  portals?: Partial<Record<"PCMV" | "ISE", string>>;
  stubMode?: "success" | "fail";
};

function resolveConfigDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "IvaanOpsAutomation");
  }
  return path.join(process.env.HOME ?? process.cwd(), ".ivaan-ops-automation");
}

export function getConfigDir(): string {
  return resolveConfigDir();
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getProfileDir(portal: "PCMV" | "ISE"): string {
  return path.join(getConfigDir(), "profiles", portal);
}

export async function loadConfig(): Promise<AgentConfig | null> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(withDefaultPortals(config), null, 2), "utf8");
}

/** PCMV and ISE use the same portal URL; separate browser profiles keep each company session. */
export function defaultPortalUrls(): Record<"PCMV" | "ISE", string> {
  return {
    PCMV: DCR_PORTAL_LOGIN_URL,
    ISE: DCR_PORTAL_LOGIN_URL,
  };
}

export function withDefaultPortals(config: AgentConfig): AgentConfig {
  const defaults = defaultPortalUrls();
  return {
    ...config,
    portals: {
      PCMV: config.portals?.PCMV ?? defaults.PCMV,
      ISE: config.portals?.ISE ?? defaults.ISE,
    },
  };
}

export async function loadConfigResolved(): Promise<AgentConfig | null> {
  const config = await loadConfig();
  return config ? withDefaultPortals(config) : null;
}
