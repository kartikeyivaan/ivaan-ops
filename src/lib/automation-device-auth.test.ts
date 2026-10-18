import { describe, expect, it } from "vitest";
import {
  hashPairingCode,
  hashAutomationSecret,
  verifyAutomationSecret,
} from "@/lib/automation-device-auth";

describe("automation device auth helpers", () => {
  it("hashes and verifies device secrets", () => {
    const plain = "test-device-secret-value";
    const hash = hashAutomationSecret(plain);
    expect(verifyAutomationSecret(plain, hash)).toBe(true);
    expect(verifyAutomationSecret("wrong", hash)).toBe(false);
  });

  it("hashes pairing codes deterministically", () => {
    expect(hashPairingCode("123456")).toBe(hashPairingCode("123456"));
    expect(hashPairingCode("123456")).not.toBe(hashPairingCode("654321"));
  });
});
