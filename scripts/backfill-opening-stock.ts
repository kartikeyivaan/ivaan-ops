import { backfillOpeningStock } from "../src/lib/inventory-backfill";
import { prisma } from "../src/lib/prisma";

function argumentValue(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const userId =
    argumentValue("--user-id") ?? process.env.BACKFILL_USER_ID ?? "";
  const companyId = argumentValue("--company-id");

  if (!userId) {
    throw new Error(
      "Provide --user-id <uuid> or set BACKFILL_USER_ID for audit ownership.",
    );
  }

  const summary = await backfillOpeningStock(prisma, {
    userId,
    companyId,
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        companyId: companyId ?? "all",
        ...summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
