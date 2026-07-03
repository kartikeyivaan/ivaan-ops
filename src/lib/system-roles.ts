import type { PrismaClient } from "@prisma/client";
import { ALL_ROLES } from "@/lib/rbac";

/** Upsert every role defined in RBAC so admin UI always lists the full set. */
export async function ensureSystemRoles(prisma: PrismaClient) {
  await Promise.all(
    ALL_ROLES.map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name, description: `${name} role` },
      }),
    ),
  );
}
