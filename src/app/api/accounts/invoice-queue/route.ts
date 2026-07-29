import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canManageInvoiceQueue } from "@/lib/accounts-permissions";
import { listInvoiceQueue, recordInvoice } from "@/lib/invoice-handover-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

const recordSchema = z.object({
  handoverId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1),
  invoiceDate: z.string().min(1),
  remarks: z.string().optional(),
  attachmentUrl: z.string().url().optional().or(z.literal("")),
});

function error(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageInvoiceQueue(session.user.roles)) {
    return error("Forbidden.", 403);
  }
  const companyId = requireActiveCompany(session);
  return NextResponse.json(await listInvoiceQueue(prisma, companyId));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageInvoiceQueue(session.user.roles)) {
    return error("Forbidden.", 403);
  }
  const companyId = requireActiveCompany(session);
  const parsed = recordSchema.safeParse(await request.json());
  if (!parsed.success) return error("Invalid invoice data.", 400);

  try {
    return NextResponse.json(
      await recordInvoice(prisma, {
        ...parsed.data,
        attachmentUrl: parsed.data.attachmentUrl || undefined,
        invoiceDate: new Date(parsed.data.invoiceDate),
        companyId,
        recordedById: session.user.id,
      }),
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message === "NOT_FOUND") return error("Handover not found.", 404);
    if (cause instanceof Error && cause.message === "INVOICE_NUMBER_REQUIRED") return error("Invoice number is required.", 400);
    throw cause;
  }
}
