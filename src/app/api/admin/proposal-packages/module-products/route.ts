import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decimalToNumber } from "@/lib/inventory";
import { canManageProposalPackages } from "@/lib/proposal-package-permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageProposalPackages(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "Super Admin access required." },
      { status: 403 },
    );
  }

  const modulesCategory = await prisma.productCategory.findUnique({
    where: { name: "Modules" },
    select: { id: true },
  });

  const products = modulesCategory
    ? await prisma.product.findMany({
        where: { categoryId: modulesCategory.id, isActive: true },
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          displayName: true,
          capacity: true,
          capacityUnit: true,
        },
      })
    : [];

  return NextResponse.json({
    products: products.map((product) => ({
      ...product,
      capacity: decimalToNumber(product.capacity),
    })),
  });
}
