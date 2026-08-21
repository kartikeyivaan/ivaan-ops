/**
 * One-time cleanup: hard-delete inactive PCM Ventures bank accounts that were
 * mistakenly created under Ivaan Solar Energy (ISE).
 *
 * Targets (from Configured accounts UI):
 *   - HDFC ****9099 (PCM Ventures) — inactive, no txs
 *   - SBI  ****9106 (PCM Ventures) — inactive; may have unassigned import txs
 *
 * Dry-run by default. Pass --apply to delete.
 *
 *   node scripts/remove-inactive-pcm-bank-accounts.cjs
 *   node scripts/remove-inactive-pcm-bank-accounts.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const TARGET_MASKED_SUFFIXES = ["9099", "9106"];

async function main() {
  console.log(
    APPLY
      ? "=== APPLY MODE — will hard-delete inactive PCM accounts under ISE ===\n"
      : "=== DRY RUN (pass --apply to delete) ===\n",
  );

  const accounts = await prisma.bankAccount.findMany({
    where: {
      isActive: false,
      accountName: { contains: "PCM", mode: "insensitive" },
      company: { code: "ISE" },
    },
    include: {
      company: { select: { code: true, name: true } },
      _count: { select: { transactions: true, imports: true, issues: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const targets = accounts.filter((a) =>
    TARGET_MASKED_SUFFIXES.some(
      (s) => a.accountNumberMasked.endsWith(s) || a.accountNumber.endsWith(s),
    ),
  );

  if (targets.length === 0) {
    console.log("No matching inactive PCM accounts found under ISE.");
    return;
  }

  for (const a of targets) {
    console.log(
      `- ${a.bankName} / ${a.accountName} ${a.accountNumberMasked} [${a.id}]`,
    );
    console.log(
      `  company=${a.company.code}  txs=${a._count.transactions}  imports=${a._count.imports}  issues=${a._count.issues}`,
    );
  }
  console.log();

  for (const a of targets) {
    const transactions = await prisma.bankTransaction.findMany({
      where: { bankAccountId: a.id },
      select: {
        id: true,
        assignmentStatus: true,
        _count: { select: { allocations: true, payments: true, issues: true } },
      },
    });

    const assigned = transactions.filter((t) => t.assignmentStatus !== "UNASSIGNED");
    const linkedPayments = transactions.reduce((n, t) => n + t._count.payments, 0);
    const allocations = transactions.reduce((n, t) => n + t._count.allocations, 0);

    if (assigned.length > 0 || linkedPayments > 0 || allocations > 0) {
      throw new Error(
        `Refusing to delete ${a.accountNumberMasked}: assigned=${assigned.length}, payments=${linkedPayments}, allocations=${allocations}. Manual review needed.`,
      );
    }

    console.log(
      `${a.accountNumberMasked}: OK to delete (${transactions.length} unassigned tx(s), no payment links).`,
    );

    if (!APPLY) continue;

    const txnIds = transactions.map((t) => t.id);

    await prisma.$transaction(async (tx) => {
      if (txnIds.length > 0) {
        await tx.bankTransactionIssue.deleteMany({
          where: { bankTransactionId: { in: txnIds } },
        });
        await tx.bankPaymentAllocation.deleteMany({
          where: { bankTransactionId: { in: txnIds } },
        });
        await tx.payment.updateMany({
          where: { bankTransactionId: { in: txnIds } },
          data: { bankTransactionId: null },
        });
        await tx.bankTransaction.deleteMany({
          where: { id: { in: txnIds } },
        });
      }

      await tx.bankTransactionIssue.deleteMany({
        where: { bankAccountId: a.id },
      });

      // Keep import audit rows; unlink from the account being removed.
      await tx.bankStatementImport.updateMany({
        where: { bankAccountId: a.id },
        data: { bankAccountId: null },
      });

      await tx.bankAccount.delete({ where: { id: a.id } });
    });

    console.log(`  Deleted account ${a.id}`);
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to hard-delete these accounts.");
  } else {
    console.log(`\nDone. Removed ${targets.length} account(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
