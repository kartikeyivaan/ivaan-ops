import type { BankStatementParserType } from "@prisma/client";
import { readFile } from "fs/promises";
import * as XLSX from "xlsx";
import { looksLikeSbiStatement, SBIStatementParser } from "@/lib/bank-parsers/sbi-statement-parser";
import { parseStatementDate, sheetRowsFromWorkbook } from "@/lib/bank-parsers/parse-utils";
import {
  BankStatementParseError,
  type BankStatementParser,
  type ParsedBankStatement,
} from "@/lib/bank-statement-types";

/**
 * Detect bank parser from worksheet content first, then filename hints.
 * Account mapping still uses statement metadata via the chosen parser — not filename alone.
 */
export async function detectBankStatementParserType(
  tempFilePath: string,
  originalFilename: string,
): Promise<BankStatementParserType> {
  const lowerName = originalFilename.toLowerCase();
  let rows: unknown[][] = [];
  let sheetText = "";

  try {
    const buffer = await readFile(tempFilePath);
    const workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: true });
    const sheet = sheetRowsFromWorkbook(workbook);
    rows = sheet.rows;
    sheetText = rows
      .slice(0, 60)
      .map((row) => row.map((c) => String(c ?? "")).join(" "))
      .join("\n")
      .toLowerCase();
  } catch {
    sheetText = "";
  }

  if (looksLikeSbiStatement(rows) || sheetText.includes("state bank of india")) {
    return "SBI";
  }

  const haystack = `${lowerName}\n${sheetText}`;
  if (/\bsbi\b/.test(haystack) || haystack.includes("sbin")) return "SBI";
  if (haystack.includes("hdfc")) return "HDFC";
  if (haystack.includes("icici")) return "ICICI";
  return "UNKNOWN";
}

export class UnsupportedBankStatementParser implements BankStatementParser {
  constructor(readonly parserType: BankStatementParserType) {}

  async parse(_tempFilePath: string): Promise<ParsedBankStatement> {
    throw new BankStatementParseError(
      `Parser for ${this.parserType} is not implemented yet.`,
      "UNSUPPORTED_PARSER",
    );
  }
}

export function createBankStatementParser(
  parserType: BankStatementParserType,
): BankStatementParser {
  switch (parserType) {
    case "SBI":
      return new SBIStatementParser();
    case "HDFC":
    case "ICICI":
    case "UNKNOWN":
    default:
      return new UnsupportedBankStatementParser(parserType);
  }
}

/**
 * Test/fixture parser used by Command 3 lifecycle tests.
 * Expects a simple CSV: date,description,reference,debit,credit,balance
 */
export class FixtureCsvBankStatementParser implements BankStatementParser {
  readonly parserType: BankStatementParserType = "UNKNOWN";

  constructor(private readonly accountNumber: string | null = null) {}

  async parse(tempFilePath: string): Promise<ParsedBankStatement> {
    const buffer = await readFile(tempFilePath);
    const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BankStatementParseError("Empty workbook.", "EMPTY_STATEMENT");
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: "",
      raw: false,
    });
    if (rows.length === 0) {
      throw new BankStatementParseError("No rows found.", "EMPTY_STATEMENT");
    }

    const transactions = rows.map((row, index) => {
      const debit = Number(String(row.debit ?? row.Debit ?? "0").replace(/,/g, "")) || 0;
      const credit = Number(String(row.credit ?? row.Credit ?? "0").replace(/,/g, "")) || 0;
      const balance =
        Number(String(row.balance ?? row.Balance ?? row.runningBalance ?? "0").replace(/,/g, "")) ||
        0;
      const dateRaw = String(row.date ?? row.Date ?? "").trim();
      const transactionDate = parseStatementDate(dateRaw);
      if (!transactionDate) {
        throw new BankStatementParseError(`Invalid date on row ${index + 1}.`, "PARSER_ERROR");
      }
      return {
        transactionDate,
        valueDate: null,
        description: String(row.description ?? row.Description ?? "").trim() || "—",
        referenceNumber:
          String(row.reference ?? row.Reference ?? row.utr ?? row.UTR ?? "").trim() || null,
        debitAmount: debit,
        creditAmount: credit,
        runningBalance: balance,
        statementSequence: index + 1,
        sourceRowNumber: index + 2,
      };
    });

    return {
      parserType: this.parserType,
      account: {
        accountNumber: this.accountNumber,
        accountName: null,
        ifscCode: null,
      },
      statementStartDate: transactions[0]?.transactionDate ?? null,
      statementEndDate: transactions[transactions.length - 1]?.transactionDate ?? null,
      transactions,
      warnings: [],
    };
  }
}

export { SBIStatementParser } from "@/lib/bank-parsers/sbi-statement-parser";
