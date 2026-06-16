import { Prisma } from "@prisma/client";

export function isReferentialConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2003" || error.code === "P2014";
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("foreign key constraint") ||
    message.includes("RESTRICT setting") ||
    message.includes("violates foreign key") ||
    message.includes("23503") ||
    message.includes("23001")
  );
}

export async function parseApiJson<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  const rawBody = await response.text();
  if (!rawBody) return {} as T;

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return {} as T;
  }
}
