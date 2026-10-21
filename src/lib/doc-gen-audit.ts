import type { AuditAction, Prisma } from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";

export const DOC_GEN_AUDIT_TABLES = {
  generations: "doc_gen_generations",
  templates: "doc_gen_templates",
  templateVersions: "doc_gen_template_versions",
  setVersions: "doc_gen_document_set_versions",
  fields: "doc_gen_fields",
  profiles: "doc_gen_profiles",
} as const;

export const DOC_GEN_AUDIT_EVENTS = {
  GENERATION_CREATED: "GENERATION_CREATED",
  TEMPLATE_PUBLISHED: "TEMPLATE_PUBLISHED",
  TEMPLATE_DELETED: "TEMPLATE_DELETED",
  TEMPLATE_VERSION_DELETED: "TEMPLATE_VERSION_DELETED",
  SET_PUBLISHED: "SET_PUBLISHED",
  FIELD_CREATED: "FIELD_CREATED",
  FIELD_UPDATED: "FIELD_UPDATED",
  FIELD_DELETED: "FIELD_DELETED",
  PROFILE_UPSERTED: "PROFILE_UPSERTED",
} as const;

export type DocGenAuditEventType =
  (typeof DOC_GEN_AUDIT_EVENTS)[keyof typeof DOC_GEN_AUDIT_EVENTS];

export const DOC_GEN_AUDIT_REASONS: Record<DocGenAuditEventType, string> = {
  GENERATION_CREATED: "MSEB documents generated",
  TEMPLATE_PUBLISHED: "Document template version published",
  TEMPLATE_DELETED: "Document template deleted",
  TEMPLATE_VERSION_DELETED: "Document template version deleted",
  SET_PUBLISHED: "Document set version published",
  FIELD_CREATED: "Document generator field created",
  FIELD_UPDATED: "Document generator field updated",
  FIELD_DELETED: "Document generator field deleted",
  PROFILE_UPSERTED: "Document generator profile saved",
};

type DocGenAuditInput = {
  eventType: DocGenAuditEventType;
  tableName: string;
  recordId: string;
  action: AuditAction;
  performedBy?: string | null;
  companyId?: string | null;
  reference?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
};

function withEventType(input: DocGenAuditInput): Prisma.InputJsonValue {
  const base: Prisma.InputJsonObject = { eventType: input.eventType };
  const value = input.newValue;
  if (value === undefined || value === null) return base;
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...base, ...value };
  }
  return { ...base, value };
}

export async function writeDocGenAudit(input: DocGenAuditInput) {
  return writeAuditLog({
    tableName: input.tableName,
    recordId: input.recordId,
    action: input.action,
    performedBy: input.performedBy,
    companyId: input.companyId,
    reference: input.reference,
    oldValue: input.oldValue,
    newValue: withEventType(input),
    reason: DOC_GEN_AUDIT_REASONS[input.eventType],
  });
}

export async function writeDocGenAuditTx(
  tx: Prisma.TransactionClient,
  input: DocGenAuditInput,
) {
  return writeAuditLogTx(tx, {
    tableName: input.tableName,
    recordId: input.recordId,
    action: input.action,
    performedBy: input.performedBy,
    companyId: input.companyId,
    reference: input.reference,
    oldValue: input.oldValue,
    newValue: withEventType(input),
    reason: DOC_GEN_AUDIT_REASONS[input.eventType],
  });
}
