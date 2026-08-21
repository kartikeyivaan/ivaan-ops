import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeTempBankStatementFile, deleteTempBankStatementFile } from "@/lib/bank-statement-temp";
import {
  createBankStatementParser,
  detectBankStatementParserType,
} from "@/lib/bank-statement-parser";
import { SBIStatementParser } from "@/lib/bank-parsers/sbi-statement-parser";
import {
  extractReferenceFromNarration,
  parseStatementAmount,
  parseStatementDate,
} from "@/lib/bank-parsers/parse-utils";

function buildSbiWorkbookBuffer(options?: { omitAccount?: boolean }): Buffer {
  const meta = options?.omitAccount
    ? [
        ["State Bank of India"],
        ["Account Name", "PCM Ventures"],
        ["Statement Period", "01 Aug 2026 to 15 Aug 2026"],
      ]
    : [
        ["State Bank of India"],
        ["Account Name", "PCM Ventures"],
        ["Account Number", "44431999106"],
        ["IFSC Code", "SBIN0018300"],
        ["Statement Period", "01 Aug 2026 to 15 Aug 2026"],
      ];

  const header = [
    "Txn Date",
    "Value Date",
    "Description",
    "Ref No./Cheque No.",
    "Debit",
    "Credit",
    "Balance",
  ];

  const rows = [
    ...meta,
    [],
    header,
    [
      "01 Aug 2026",
      "01 Aug 2026",
      "OPENING BALANCE",
      "",
      "",
      "",
      "1,00,000.00",
    ],
    [
      "02 Aug 2026",
      "02 Aug 2026",
      "BY TRANSFER-NEFT CR-HDFC0000123-ACME TRADERS-INV88",
      "SBIN426214001234",
      "",
      "50,000.00",
      "1,50,000.00",
    ],
    [
      "03 Aug 2026",
      "03 Aug 2026",
      "TO TRANSFER-UPI/412876543210/VENDOR/PAY",
      "",
      "1,250.50",
      "",
      "1,48,749.50",
    ],
    [
      "05 Aug 2026",
      "05 Aug 2026",
      "BY TRANSFER-IMPS CR CUSTOMER PAYMENT UTR:ICIC123456789012",
      "",
      "",
      "10,000.00",
      "1,58,749.50",
    ],
    ["15 Aug 2026", "15 Aug 2026", "CLOSING BALANCE", "", "", "", "1,58,749.50"],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("parse utils", () => {
  it("parses SBI-style amounts and dates", () => {
    expect(parseStatementAmount("1,50,000.00")).toBe(150000);
    expect(parseStatementAmount("1,250.50")).toBe(1250.5);
    expect(parseStatementDate("02 Aug 2026")?.toISOString().slice(0, 10)).toBe("2026-08-02");
    expect(parseStatementDate("05/08/2026")?.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("extracts UTR-like references from narration", () => {
    expect(
      extractReferenceFromNarration("BY TRANSFER-IMPS CR CUSTOMER PAYMENT UTR:ICIC123456789012"),
    ).toBe("ICIC123456789012");
    expect(extractReferenceFromNarration("TO TRANSFER-UPI/412876543210/VENDOR/PAY")).toBe(
      "412876543210",
    );
  });
});

describe("SBIStatementParser", () => {
  it("extracts account metadata, period, and normalized transactions", async () => {
    const buffer = buildSbiWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile("sbi-sample.xlsx", buffer);
    try {
      const parsed = await new SBIStatementParser().parse(tempPath);

      expect(parsed.parserType).toBe("SBI");
      expect(parsed.account.accountNumber).toBe("44431999106");
      expect(parsed.account.accountName).toBe("PCM Ventures");
      expect(parsed.account.ifscCode).toBe("SBIN0018300");
      expect(parsed.statementStartDate?.toISOString().slice(0, 10)).toBe("2026-08-01");
      expect(parsed.statementEndDate?.toISOString().slice(0, 10)).toBe("2026-08-15");

      // Opening/closing balance rows skipped
      expect(parsed.transactions).toHaveLength(3);

      const [credit, debit, creditFromNarration] = parsed.transactions;
      expect(credit!.creditAmount).toBe(50000);
      expect(credit!.debitAmount).toBe(0);
      expect(credit!.referenceNumber).toBe("SBIN426214001234");
      expect(credit!.runningBalance).toBe(150000);
      expect(credit!.statementSequence).toBe(1);

      expect(debit!.debitAmount).toBe(1250.5);
      expect(debit!.creditAmount).toBe(0);
      expect(debit!.referenceNumber).toBe("412876543210");

      expect(creditFromNarration!.creditAmount).toBe(10000);
      expect(creditFromNarration!.referenceNumber).toBe("ICIC123456789012");
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });

  it("detects SBI from content and factory returns SBIStatementParser", async () => {
    const buffer = buildSbiWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile("monthly-export.xlsx", buffer);
    try {
      const detected = await detectBankStatementParserType(tempPath, "monthly-export.xlsx");
      expect(detected).toBe("SBI");
      const parser = createBankStatementParser(detected);
      expect(parser).toBeInstanceOf(SBIStatementParser);
      const parsed = await parser.parse(tempPath);
      expect(parsed.transactions.length).toBeGreaterThan(0);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });

  it("warns when account number is missing from metadata", async () => {
    const buffer = buildSbiWorkbookBuffer({ omitAccount: true });
    const { tempPath } = await writeTempBankStatementFile("sbi-no-account.xlsx", buffer);
    try {
      const parsed = await new SBIStatementParser().parse(tempPath);
      expect(parsed.account.accountNumber).toBeNull();
      expect(parsed.warnings.some((w) => w.toLowerCase().includes("account number"))).toBe(true);
      expect(parsed.transactions.length).toBe(3);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });
});
