import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSafetyStock } from "@/lib/safety-stock-permissions";
import { requireActiveCompany } from "@/lib/session";

const schema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  safetyQty: z.coerce.number().min(0),
  effectiveFrom: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageSafetyStock(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  return NextResponse.json(await prisma.inventorySafetyStock.findMany({
    where: { companyId: requireActiveCompany(session), isActive: true },
    include: { warehouse: { select: { name: true } }, product: { select: { displayName: true } } },
    orderBy: [{ warehouse: { name: "asc" } }, { product: { displayName: "asc" } }],
  }));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageSafetyStock(session.user.roles)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const companyId = requireActiveCompany(session);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Invalid safety stock data." }, { status: 400 });
  const warehouse = await prisma.warehouse.findFirst({ where: { id: parsed.data.warehouseId, companyId } });
  if (!warehouse) return NextResponse.json({ message: "Warehouse not found." }, { status: 404 });
  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  const row = await prisma.$transaction(async (tx) => {
    await tx.inventorySafetyStock.updateMany({
      where: { companyId, warehouseId: parsed.data.warehouseId, productId: parsed.data.productId, isActive: true },
      data: { isActive: false, updatedById: session.user.id },
    });
    return tx.inventorySafetyStock.upsert({
      where: { companyId_warehouseId_productId_effectiveFrom: { companyId, warehouseId: parsed.data.warehouseId, productId: parsed.data.productId, effectiveFrom } },
      create: { companyId, ...parsed.data, effectiveFrom, createdById: session.user.id },
      update: { safetyQty: parsed.data.safetyQty, isActive: true, updatedById: session.user.id },
      include: { warehouse: { select: { name: true } }, product: { select: { displayName: true } } },
    });
  });
  return NextResponse.json(row);
}
