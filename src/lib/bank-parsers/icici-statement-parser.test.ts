import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeTempBankStatementFile, deleteTempBankStatementFile } from "@/lib/bank-statement-temp";
import {
  createBankStatementParser,
  detectBankStatementParserType,
} from "@/lib/bank-statement-parser";
import { ICICIStatementParser } from "@/lib/bank-parsers/icici-statement-parser";
import { parseStatementDate, parseStatementSignedAmount } from "@/lib/bank-parsers/parse-utils";
import { detectUploadedBalanceContinuity } from "@/lib/bank-import-analysis";

function buildIciciWorkbookBuffer(): Buffer {
  const rows = [
    ["DETAILED STATEMENT"],
    [],
    [],
    [],
    [],
    ["Transactions List -   -IVAAN SOLAR ENERGY (INR) - 037505012379"],
    [
      "No.",
      "Transaction ID",
      "Value Date",
      "Txn Posted Date",
      "ChequeNo.",
      "Description",
      "Cr/Dr",
      "Transaction Amount(INR)",
      "Available Balance(INR)",
    ],
    [
      1,
      "S32880713",
      "08/07/2026",
      "08/07/2026 11:47:53 AM ",
      "-",
      "RTGS-SBINR12026070834491979-IVAAN SOLAR ENERGY",
      "CR",
      200000,
      200000,
    ],
    [
      2,
      "S34363257",
      "08/07/2026",
      "08/07/2026 02:11:58 PM ",
      "-",
      "INF/NEFT/IN42618958303612/SBIN0018300/TEST",
      "DR",
      1,
      199999,
    ],
    [
      3,
      "S61993157",
      "10/07/2026",
      "10/07/2026 06:57:53 PM ",
      "-",
      "RTGS/ICICR42026071000574498/YESB0000078/SUNLIT",
      "DR",
      830393,
      -630394,
    ],
    [
      4,
      "S62149240",
      "10/07/2026",
      "10/07/2026 07:10:10 PM ",
      "-",
      "INF/INFT/045104802951/iseharshal78",
      "CR",
      800000,
      169606,
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "OpTransactionHistoryUX3");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xls" }));
}

describe("ICICI parse helpers", () => {
  it("parses posted datetime and signed available balance", () => {
    expect(parseStatementDate("08/07/2026 11:47:53 AM")?.toISOString().slice(0, 10)).toBe(
      "2026-07-08",
    );
    expect(parseStatementSignedAmount(-630394)).toBe(-630394);
    expect(parseStatementSignedAmount("(1,234.50)")).toBe(-1234.5);
  });
});

describe("ICICIStatementParser", () => {
  it("extracts account metadata and maps Cr/Dr amounts", async () => {
    const buffer = buildIciciWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile("OpTransactionHistoryUX3.xls", buffer);
    try {
      const parsed = await new ICICIStatementParser().parse(tempPath);

      expect(parsed.parserType).toBe("ICICI");
      expect(parsed.account.accountNumber).toBe("037505012379");
      expect(parsed.account.accountName).toBe("IVAAN SOLAR ENERGY");
      expect(parsed.transactions).toHaveLength(4);

      const [credit, debit, odDebit, recovery] = parsed.transactions;
      expect(credit!.creditAmount).toBe(200000);
      expect(credit!.debitAmount).toBe(0);
      expect(credit!.referenceNumber).toBe("S32880713");
      expect(credit!.transactionDate.toISOString().slice(0, 10)).toBe("2026-07-08");

      expect(debit!.debitAmount).toBe(1);
      expect(debit!.creditAmount).toBe(0);

      expect(odDebit!.runningBalance).toBe(-630394);
      expect(recovery!.runningBalance).toBe(169606);

      expect(detectUploadedBalanceContinuity(parsed.transactions)).toEqual([]);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });

  it("detects ICICI from OpTransactionHistory filename/content", async () => {
    const buffer = buildIciciWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile(
      "OpTransactionHistoryUX321-08-2026.xls",
      buffer,
    );
    try {
      const detected = await detectBankStatementParserType(
        tempPath,
        "OpTransactionHistoryUX321-08-2026.xls",
      );
      expect(detected).toBe("ICICI");
      expect(createBankStatementParser(detected)).toBeInstanceOf(ICICIStatementParser);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });
});
