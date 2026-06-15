import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewProducts } from "@/lib/product-permissions";
import { listMasters } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewProducts(session.user.roles)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  const masters = await listMasters(prisma);
  return NextResponse.json(masters);
}
