/**
 * One-time correction: remove transactions that were imported onto HDFC bank
 * accounts using the SBI parser (wrong parser before the HDFC fix).
 *
 * Dry-run by default. Pass --fix to apply.
 *
 *   npx tsx scripts/remove-sbi-parsed-hdfc-transactions.ts
 *   npx tsx scripts/remove-sbi-parsed-hdfc-transactions.ts --fix
 *
 * Or with an explicit DB URL:
 *   DATABASE_URL="..." npx tsx scripts/remove-sbi-parsed-hdfc-transactions.ts --fix
 */
import {
  BankPaymentAllocationStatus,
  PaymentVerificationStatus,
  PrismaClient,
  ReceivedInAccount,
} from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--fix");

async function main() {
  console.log(
    APPLY
      ? "=== APPLY MODE — will delete SBI-parsed rows on HDFC accounts ===\n"
      : "=== DRY RUN (pass --fix to apply) ===\n",
  );

  const hdfcAccounts = await prisma.bankAccount.findMany({
    where: { receivedInAccount: ReceivedInAccount.HDFC },
    select: {
      id: true,
      accountName: true,
      accountNumberMasked: true,
      bankName: true,
      companyId: true,
    },
  });

  if (hdfcAccounts.length === 0) {
    console.log("No HDFC bank accounts found. Nothing to do.");
    return;
  }

  console.log(`HDFC accounts (${hdfcAccounts.length}):`);
  for (const a of hdfcAccounts) {
    console.log(`  - ${a.bankName} / ${a.accountName} (${a.accountNumberMasked}) [${a.id}]`);
  }
  console.log();

  const accountIds = hdfcAccounts.map((a) => a.id);

  const sbiImports = await prisma.bankStatementImport.findMany({
    where: {
      bankAccountId: { in: accountIds },
      parserType: "SBI",
    },
    select: {
      id: true,
      bankAccountId: true,
      originalFilename: true,
      uploadedAt: true,
      processingStatus: true,
      newTransactions: true,
      transactionsDetected: true,
    },
    orderBy: { uploadedAt: "asc" },
  });

  console.log(`SBI-parser imports on HDFC accounts: ${sbiImports.length}`);
  for (const row of sbiImports) {
    console.log(
      `  - ${row.uploadedAt.toISOString()}  ${row.originalFilename}  status=${row.processingStatus}  new=${row.newTransactions}/${row.transactionsDetected}  [${row.id}]`,
    );
  }
  console.log();

  const importIds = sbiImports.map((r) => r.id);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: { in: accountIds },
      ...(importIds.length > 0
        ? { sourceImportId: { in: importIds } }
        : { id: { in: [] } }),
    },
    select: {
      id: true,
      bankAccountId: true,
      sourceImportId: true,
      transactionDate: true,
      description: true,
      referenceNumber: true,
      debitAmount: true,
      creditAmount: true,
      assignmentStatus: true,
      paymentCode: true,
      _count: {
        select: {
          allocations: true,
          payments: true,
          issues: true,
        },
      },
    },
    orderBy: [{ transactionDate: "asc" }, { statementSequence: "asc" }],
  });

  const linkedPaymentCount = transactions.reduce((n, t) => n + t._count.payments, 0);
  const allocationCount = transactions.reduce((n, t) => n + t._count.allocations, 0);
  const issueLinkCount = transactions.reduce((n, t) => n + t._count.issues, 0);

  console.log(`Transactions from those imports: ${transactions.length}`);
  console.log(`  Linked PI payments: ${linkedPaymentCount}`);
  console.log(`  Payment allocations: ${allocationCount}`);
  console.log(`  Linked issues: ${issueLinkCount}`);

  if (transactions.length > 0) {
    console.log("\nSample (first 15):");
    for (const t of transactions.slice(0, 15)) {
      const date = t.transactionDate.toISOString().slice(0, 10);
      const desc = t.description.slice(0, 48);
      console.log(
        `  ${date}  ${desc.padEnd(48)}  dr=${t.debitAmount} cr=${t.creditAmount}  assign=${t.assignmentStatus}`,
      );
    }
    if (transactions.length > 15) {
      console.log(`  ... (+${transactions.length - 15} more)`);
    }
  }

  const relatedIssues = await prisma.bankTransactionIssue.findMany({
    where: {
      OR: [
        ...(importIds.length > 0 ? [{ sourceImportId: { in: importIds } }] : []),
        ...(transactions.length > 0
          ? [{ bankTransactionId: { in: transactions.map((t) => t.id) } }]
          : []),
        {
          bankAccountId: { in: accountIds },
          issueType: "EXISTING_DATA_MISMATCH",
          status: { in: ["OPEN", "UNDER_REVIEW"] },
        },
      ],
    },
    select: { id: true, issueType: true, status: true, sourceImportId: true },
  });

  console.log(`\nRelated issues to clear: ${relatedIssues.length}`);

  if (!APPLY) {
    console.log(
      "\nDry run complete. Re-run with --fix to delete these SBI-parsed transactions,",
    );
    console.log("unlink any PI payments, remove allocations, and clear related issues.");
    console.log("Then re-upload the HDFC statement with the corrected parser.");
    return;
  }

  if (transactions.length === 0 && relatedIssues.length === 0 && sbiImports.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const txnIds = transactions.map((t) => t.id);

  await prisma.$transaction(async (tx) => {
    if (txnIds.length > 0) {
      const released = await tx.bankPaymentAllocation.updateMany({
        where: {
          bankTransactionId: { in: txnIds },
          allocationStatus: BankPaymentAllocationStatus.ACTIVE,
        },
        data: {
          allocationStatus: BankPaymentAllocationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
      console.log(`\nReleased active allocations: ${released.count}`);

      const deletedAllocations = await tx.bankPaymentAllocation.deleteMany({
        where: { bankTransactionId: { in: txnIds } },
      });
      console.log(`Deleted allocations: ${deletedAllocations.count}`);

      const unlinkedPayments = await tx.payment.updateMany({
        where: { bankTransactionId: { in: txnIds } },
        data: {
          bankTransactionId: null,
          verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
        },
      });
      console.log(`Unlinked PI payments (→ MANUAL_UNVERIFIED): ${unlinkedPayments.count}`);
    }

    const issueIds = relatedIssues.map((i) => i.id);
    if (issueIds.length > 0) {
      const deletedIssues = await tx.bankTransactionIssue.deleteMany({
        where: { id: { in: issueIds } },
      });
      console.log(`Deleted issues: ${deletedIssues.count}`);
    }

    if (txnIds.length > 0) {
      const deletedTxns = await tx.bankTransaction.deleteMany({
        where: { id: { in: txnIds } },
      });
      console.log(`Deleted bank transactions: ${deletedTxns.count}`);
    }

    if (importIds.length > 0) {
      // Keep import audit rows but clear heavy preview payload and mark cancelled.
      const updatedImports = await tx.bankStatementImport.updateMany({
        where: { id: { in: importIds } },
        data: {
          processingStatus: "CANCELLED",
          analysisPayload: null,
          errorMessage:
            "One-time correction: SBI-parsed import on HDFC account removed so statement can be re-uploaded with HDFC parser.",
          completedAt: new Date(),
        },
      });
      console.log(`Marked SBI imports CANCELLED: ${updatedImports.count}`);
    }
  });

  console.log("\nDone. Re-upload the HDFC statement — rows should import as NEW.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
