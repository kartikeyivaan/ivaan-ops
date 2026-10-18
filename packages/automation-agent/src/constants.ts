export const AGENT_VERSION = "0.1.0";

/** Shown in the desktop pairing form when no override is configured at build time. */
export const DEFAULT_IVAAN_OPS_BASE_URL =
  process.env.IVAAN_OPS_DEFAULT_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/** NISE DCR Verification Portal — same login for all companies; choose company on the form. */
export const DCR_PORTAL_LOGIN_URL = "https://solardcrportal.nise.res.in/Account/Login";

export type PortalCode = "PCMV" | "ISE";
export const PORTAL_ORDER: Record<string, PortalCode[]> = {
  PCMV_THEN_ISE: ["PCMV", "ISE"],
  ISE_THEN_PCMV: ["ISE", "PCMV"],
  PCMV_ONLY: ["PCMV"],
  ISE_ONLY: ["ISE"],
};
