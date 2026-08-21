import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  tableName: string;
  recordId: string;
  action: AuditAction;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  performedBy?: string | null;
  companyId?: string | null;
  reference?: string | null;
  reason?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      tableName: input.tableName,
      recordId: input.recordId,
      action: input.action,
      oldValue: input.oldValue ?? Prisma.JsonNull,
      newValue: input.newValue ?? Prisma.JsonNull,
      performedBy: input.performedBy ?? null,
      companyId: input.companyId ?? null,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
    },
  });
}

export async function writeAuditLogTx(
  tx: Prisma.TransactionClient,
  input: AuditInput,
) {
  return tx.auditLog.create({
    data: {
      tableName: input.tableName,
      recordId: input.recordId,
      action: input.action,
      oldValue: input.oldValue ?? Prisma.JsonNull,
      newValue: input.newValue ?? Prisma.JsonNull,
      performedBy: input.performedBy ?? null,
      companyId: input.companyId ?? null,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
    },
  });
}
