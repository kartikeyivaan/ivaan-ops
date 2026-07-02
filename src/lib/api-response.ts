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

export type ApiErrorPayload = {
  message?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

export function formatApiErrorMessage(
  payload: ApiErrorPayload,
  fallback = "Something went wrong.",
): string {
  const fieldMessages = payload.details?.fieldErrors
    ? Object.entries(payload.details.fieldErrors).flatMap(([field, messages]) =>
        (messages ?? []).map((message) => `${field}: ${message}`),
      )
    : [];
  const formMessages = payload.details?.formErrors ?? [];

  const detail = [...formMessages, ...fieldMessages][0];
  if (detail) {
    return payload.message ? `${payload.message} ${detail}` : detail;
  }

  return payload.message ?? fallback;
}

export function mapPrismaCustomerError(error: unknown): {
  code: string;
  message: string;
  status: number;
} | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : String(error.meta?.target ?? "");
      if (target.includes("gst_number")) {
        return {
          code: "DUPLICATE_GST",
          message: "Customer with this GST already exists.",
          status: 409,
        };
      }
      if (target.includes("customer_code")) {
        return {
          code: "DUPLICATE_CODE",
          message: "Could not generate a unique customer code. Try again.",
          status: 409,
        };
      }
    }

    if (error.code === "P2011" || error.code === "P2022") {
      return {
        code: "SCHEMA_MISMATCH",
        message:
          "The database schema is out of date. Run prisma migrate deploy on the server, then try again.",
        status: 500,
      };
    }
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("company_id") ||
    message.includes("Null constraint violation") ||
    message.includes("column") && message.includes("does not exist")
  ) {
    return {
      code: "SCHEMA_MISMATCH",
      message:
        "The database schema is out of date. Run prisma migrate deploy on the server, then try again.",
      status: 500,
    };
  }

  return null;
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
