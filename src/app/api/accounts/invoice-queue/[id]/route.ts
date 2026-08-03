import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageInvoiceQueue } from "@/lib/accounts-permissions";
import { getInvoiceHandoverDetail } from "@/lib/invoice-handover-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

function error(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageInvoiceQueue(session.user.roles)) {
    return error("Forbidden.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return error("Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const detail = await getInvoiceHandoverDetail(prisma, companyId, id);
  if (!detail) return error("Handover not found.", 404);
  return NextResponse.json(detail);
}
