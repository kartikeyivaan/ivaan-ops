import bcrypt from "bcryptjs";
import { AutomationDeviceStatus, type PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomInt } from "crypto";

const DEVICE_SECRET_BYTES = 32;
const PAIRING_CODE_LENGTH = 6;
const PAIRING_TTL_MS = 15 * 60 * 1000;

export function hashAutomationSecret(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyAutomationSecret(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function generatePairingCode(): string {
  const max = 10 ** PAIRING_CODE_LENGTH;
  return String(randomInt(0, max)).padStart(PAIRING_CODE_LENGTH, "0");
}

export function generateDeviceSecret(): string {
  return randomBytes(DEVICE_SECRET_BYTES).toString("base64url");
}

export async function createAutomationPairingCode(
  prisma: PrismaClient,
  userId: string,
): Promise<{ pairingCode: string; expiresAt: Date }> {
  const pairingCode = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.automationDevicePairingCode.create({
    data: {
      userId,
      codeHash: hashPairingCode(pairingCode),
      expiresAt,
    },
  });
  return { pairingCode, expiresAt };
}

export async function registerAutomationDevice(
  prisma: PrismaClient,
  input: { pairingCode: string; label?: string; agentVersion?: string },
): Promise<{ deviceId: string; deviceSecret: string }> {
  const codeHash = hashPairingCode(input.pairingCode);
  const pairing = await prisma.automationDevicePairingCode.findFirst({
    where: {
      codeHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!pairing) throw new Error("PAIRING_INVALID");

  const deviceSecret = generateDeviceSecret();
  const device = await prisma.$transaction(async (tx) => {
    const created = await tx.automationDevice.create({
      data: {
        userId: pairing.userId,
        label: input.label?.trim() || null,
        secretHash: hashAutomationSecret(deviceSecret),
        agentVersion: input.agentVersion?.trim() || null,
        status: AutomationDeviceStatus.ACTIVE,
        lastSeenAt: new Date(),
      },
    });
    await tx.automationDevicePairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date(), deviceId: created.id },
    });
    return created;
  });

  return { deviceId: device.id, deviceSecret };
}

export async function authenticateAutomationDevice(
  prisma: PrismaClient,
  authorizationHeader: string | null,
): Promise<{ deviceId: string; userId: string }> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("DEVICE_UNAUTHORIZED");
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  const separator = token.indexOf(".");
  if (separator <= 0) throw new Error("DEVICE_UNAUTHORIZED");
  const deviceId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!deviceId || !secret) throw new Error("DEVICE_UNAUTHORIZED");

  const device = await prisma.automationDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, userId: true, secretHash: true, status: true },
  });
  if (!device || device.status !== AutomationDeviceStatus.ACTIVE) {
    throw new Error("DEVICE_UNAUTHORIZED");
  }
  if (!verifyAutomationSecret(secret, device.secretHash)) {
    throw new Error("DEVICE_UNAUTHORIZED");
  }
  return { deviceId: device.id, userId: device.userId };
}

export async function tryAuthenticateAutomationDevice(
  prisma: PrismaClient,
  authorizationHeader: string | null,
): Promise<{ deviceId: string; userId: string } | null> {
  try {
    return await authenticateAutomationDevice(prisma, authorizationHeader);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "DEVICE_UNAUTHORIZED") {
      return null;
    }
    throw cause;
  }
}
