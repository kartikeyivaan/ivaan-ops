import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeTempBankStatementFile, deleteTempBankStatementFile } from "@/lib/bank-statement-temp";
import {
  createBankStatementParser,
  detectBankStatementParserType,
} from "@/lib/bank-statement-parser";
import { HDFCStatementParser } from "@/lib/bank-parsers/hdfc-statement-parser";
import { parseStatementDate } from "@/lib/bank-parsers/parse-utils";
import { detectUploadedBalanceContinuity } from "@/lib/bank-import-analysis";

function buildHdfcWorkbookBuffer(): Buffer {
  const rows = [
    ["HDFC BANK Ltd.                                      Page No .:   1"],
    [],
    [],
    [],
    ["", "", "", "", "Account Branch :JALGAON"],
    ["M/S.    IVAAN SOLAR ENERGY", "", "", "", "Address :PLOT NO 134/135"],
    [],
    [],
    [],
    [],
    [],
    [],
    ["JOINT HOLDERS :", "", "", "", "OD Limit :0   Currency :INR"],
    ["", "", "", "", "Cust ID :214143119"],
    [
      "Nomination  :  Not Registered",
      "",
      "",
      "",
      "Account No :50200073759818   Preferred Customer",
    ],
    [
      "Statement From  :  01/04/2026         To  :  20/08/2026",
      "",
      "",
      "",
      "A/C Open Date :20/10/2022",
    ],
    ["", "", "", "", "Account Status :Regular"],
    ["", "", "", "", "RTGS/NEFT IFSC :HDFC0000180   MICR :425240001"],
    [],
    ["************************************************************"],
    [
      "Date",
      "Narration",
      "Chq./Ref.No.",
      "Value Dt",
      "Withdrawal Amt.",
      "Deposit Amt.",
      "Closing Balance",
    ],
    [
      "********",
      "**********************************",
      "************",
      "********",
      "******************",
      "******************",
      "******************",
    ],
    [
      "02/04/26",
      "UPI-HP PETROL PUMP-PAY",
      "0000120946828758",
      "02/04/26",
      1700,
      "",
      121668.12,
    ],
    [
      "13/04/26",
      "UPI-GOOGLE INDIA DIGITAL-GPAY",
      "0000121534014595",
      "13/04/26",
      3760,
      "",
      117908.12,
    ],
    [
      "07/04/26",
      "NEFT CR-SBIN0018300-IVAAN SOLAR ENERGY",
      "SBIN226094213162",
      "07/04/26",
      "",
      100000,
      217908.12,
    ],
    [
      "20/08/26",
      "UPI-AMAZON INDIA-AMAZON@RAPL",
      "0000128213988220",
      "20/08/26",
      386.06,
      "",
      217522.06,
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet 1");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xls" }));
}

describe("HDFC date parsing", () => {
  it("parses HDFC DD/MM/YY transaction dates as day-month-year", () => {
    expect(parseStatementDate("02/04/26")?.toISOString().slice(0, 10)).toBe("2026-04-02");
    expect(parseStatementDate("13/04/26")?.toISOString().slice(0, 10)).toBe("2026-04-13");
    expect(parseStatementDate("20/08/26")?.toISOString().slice(0, 10)).toBe("2026-08-20");
    expect(parseStatementDate("01/04/2026")?.toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});

describe("HDFCStatementParser", () => {
  it("extracts account metadata, period, and normalized transactions", async () => {
    const buffer = buildHdfcWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile("hdfc-sample.xls", buffer);
    try {
      const parsed = await new HDFCStatementParser().parse(tempPath);

      expect(parsed.parserType).toBe("HDFC");
      expect(parsed.account.accountNumber).toBe("50200073759818");
      expect(parsed.account.accountName).toBe("IVAAN SOLAR ENERGY");
      expect(parsed.account.ifscCode).toBe("HDFC0000180");
      expect(parsed.statementStartDate?.toISOString().slice(0, 10)).toBe("2026-04-01");
      expect(parsed.statementEndDate?.toISOString().slice(0, 10)).toBe("2026-08-20");
      expect(parsed.transactions).toHaveLength(4);

      const first = parsed.transactions[0]!;
      expect(first.transactionDate.toISOString().slice(0, 10)).toBe("2026-04-02");
      expect(first.debitAmount).toBe(1700);
      expect(first.creditAmount).toBe(0);
      expect(first.runningBalance).toBe(121668.12);
      expect(first.referenceNumber).toBe("0000120946828758");

      const day13 = parsed.transactions[1]!;
      expect(day13.transactionDate.toISOString().slice(0, 10)).toBe("2026-04-13");
      expect(day13.debitAmount).toBe(3760);

      const credit = parsed.transactions[2]!;
      expect(credit.creditAmount).toBe(100000);
      expect(credit.referenceNumber).toBe("SBIN226094213162");
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });

  it("detects HDFC from content and does not classify as SBI", async () => {
    const buffer = buildHdfcWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile(
      "Acct_Statement_XXXXXXXX9818_21082026.xls",
      buffer,
    );
    try {
      const detected = await detectBankStatementParserType(
        tempPath,
        "Acct_Statement_XXXXXXXX9818_21082026.xls",
      );
      expect(detected).toBe("HDFC");
      const parser = createBankStatementParser(detected);
      expect(parser).toBeInstanceOf(HDFCStatementParser);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });
});

describe("HDFC real statement fixture continuity", () => {
  it("keeps running balances continuous when all DD/MM/YY rows parse", async () => {
    const buffer = buildHdfcWorkbookBuffer();
    const { tempPath } = await writeTempBankStatementFile("hdfc-continuity.xls", buffer);
    try {
      const parsed = await new HDFCStatementParser().parse(tempPath);
      const issues = detectUploadedBalanceContinuity(parsed.transactions);
      expect(issues).toEqual([]);
    } finally {
      await deleteTempBankStatementFile(tempPath);
    }
  });
});
