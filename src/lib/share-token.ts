import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless, tamper-proof share tokens for public quotation PDF links.
 *
 * A token is `base64url(payload).base64url(hmac)` where the payload carries the
 * quotation id and an absolute expiry timestamp. Because it is signed with
 * AUTH_SECRET and the id is a random UUID, the resulting link is unguessable
 * ("non-traceable") and cannot be forged or have its expiry extended.
 */

const DEFAULT_TTL_DAYS = 5;

type QuotationSharePayload = { q: string; e: number };
type ProjectProposalSharePayload = { p: string; e: number };

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured; cannot sign share tokens.");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function verifySignedPayload<T extends Record<string, unknown>>(
  token: string,
  field: keyof T,
): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expected = sign(encoded);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload[field] !== "string" ||
    typeof payload.e !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.e) return null;

  return payload;
}

export function signQuotationShareToken(
  quotationId: string,
  ttlDays = DEFAULT_TTL_DAYS,
): string {
  const payload: QuotationSharePayload = {
    q: quotationId,
    e: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyQuotationShareToken(
  token: string,
): { quotationId: string } | null {
  const payload = verifySignedPayload<QuotationSharePayload>(token, "q");
  if (!payload) return null;
  return { quotationId: payload.q };
}

export function signProjectProposalShareToken(
  proposalId: string,
  ttlDays = DEFAULT_TTL_DAYS,
): string {
  const payload: ProjectProposalSharePayload = {
    p: proposalId,
    e: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyProjectProposalShareToken(
  token: string,
): { proposalId: string } | null {
  const payload = verifySignedPayload<ProjectProposalSharePayload>(token, "p");
  if (!payload) return null;
  return { proposalId: payload.p };
}
