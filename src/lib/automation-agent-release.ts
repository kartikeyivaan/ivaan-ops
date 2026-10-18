export type AgentReleaseInfo = {
  version: string;
  minVersion: string;
  downloadUrl: string;
  sha256: string;
  fileName: string;
};

export function getLatestAgentRelease(): AgentReleaseInfo {
  const version = process.env.DCR_AGENT_RELEASE_VERSION?.trim() || "0.1.0";
  const minVersion = process.env.DCR_AGENT_MIN_VERSION?.trim() || version;
  const downloadUrl = process.env.DCR_AGENT_RELEASE_DOWNLOAD_URL?.trim() || "";
  const sha256 = process.env.DCR_AGENT_RELEASE_SHA256?.trim() || "";
  const fileName =
    process.env.DCR_AGENT_RELEASE_FILE_NAME?.trim() || `IvaanOpsDCRAgentSetup-${version}.exe`;

  return { version, minVersion, downloadUrl, sha256, fileName };
}
