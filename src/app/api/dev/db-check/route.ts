import { NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const host = databaseUrl.includes("@")
    ? databaseUrl.split("@")[1]?.split("/")[0]
    : "not configured";

  let kartikeyExists = false;
  let adminExists = false;
  let userCount = 0;

  if (isDatabaseConfigured()) {
    userCount = await prisma.user.count();
    kartikeyExists =
      (await prisma.user.findUnique({ where: { email: "kartikey.ivaan@gmail.com" } })) !==
      null;
    adminExists =
      (await prisma.user.findUnique({ where: { email: "admin@ivaansolar.com" } })) !== null;
  }

  return NextResponse.json({
    databaseConfigured: isDatabaseConfigured(),
    databaseHost: host,
    userCount,
    kartikeyExists,
    adminExists,
  });
}
