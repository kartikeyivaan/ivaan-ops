import { afterEach, describe, expect, it } from "vitest";
import { getLatestAgentRelease } from "./automation-agent-release";

describe("getLatestAgentRelease", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns defaults when env is unset", () => {
    delete process.env.DCR_AGENT_RELEASE_VERSION;
    delete process.env.DCR_AGENT_RELEASE_DOWNLOAD_URL;
    const release = getLatestAgentRelease();
    expect(release.version).toBe("0.1.0");
    expect(release.fileName).toBe("IvaanOpsDCRAgentSetup-0.1.0.exe");
    expect(release.downloadUrl).toBe("");
  });

  it("reads configured release metadata", () => {
    process.env.DCR_AGENT_RELEASE_VERSION = "0.2.0";
    process.env.DCR_AGENT_RELEASE_DOWNLOAD_URL = "https://example.com/agent.exe";
    process.env.DCR_AGENT_RELEASE_SHA256 = "abc";
    const release = getLatestAgentRelease();
    expect(release.version).toBe("0.2.0");
    expect(release.downloadUrl).toBe("https://example.com/agent.exe");
    expect(release.sha256).toBe("abc");
  });
});
