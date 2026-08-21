import {
  BankStatementParseError,
  type BankStatementParser,
  type NormalizedBankTransaction,
  type ParsedBankStatement,
} from "@/lib/bank-statement-types";
import {
  extractDigitsAccountNumber,
  extractReferenceFromNarration,
  normalizeHeaderKey,
  parseStatementAmount,
  parseStatementDate,
  readWorkbookFromPath,
  sheetRowsFromWorkbook,
} from "@/lib/bank-parsers/parse-utils";

type ColumnMap = {
  txnDate: number;
  valueDate: number | null;
  description: number;
  reference: number | null;
  debit: number | null;
  credit: number | null;
  balance: number;
};

const TXN_DATE_KEYS = new Set([
  "txn date",
  "tran date",
  "transaction date",
  "txn dt",
  "date",
  "posting date",
]);

const VALUE_DATE_KEYS = new Set(["value date", "value dt", "val date"]);

const DESCRIPTION_KEYS = new Set([
  "description",
  "narration",
  "particulars",
  "details",
  "transaction remarks",
  "remarks",
]);

const REFERENCE_KEYS = new Set([
  "ref no cheque no",
  "ref no",
  "reference no",
  "reference number",
  "cheque no",
  "chq no",
  "chq ref no",
  "utr",
  "utr number",
  "transaction id",
]);

const DEBIT_KEYS = new Set([
  "debit",
  "withdrawal",
  "withdrawal amt",
  "debit amount",
  "amount debited",
]);

const CREDIT_KEYS = new Set([
  "credit",
  "deposit",
  "deposit amt",
  "credit amount",
  "amount credited",
]);

const BALANCE_KEYS = new Set(["balance", "running balance", "closing balance"]);

function findColumn(headers: string[], keys: Set<string>): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    if (keys.has(headers[i]!)) return i;
  }
  return null;
}

function detectHeaderRow(rows: unknown[][]): { headerIndex: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeHeaderKey);
    const txnDate = findColumn(headers, TXN_DATE_KEYS);
    const description = findColumn(headers, DESCRIPTION_KEYS);
    const balance = findColumn(headers, BALANCE_KEYS);
    const debit = findColumn(headers, DEBIT_KEYS);
    const credit = findColumn(headers, CREDIT_KEYS);

    if (txnDate === null || description === null || balance === null) continue;
    if (debit === null && credit === null) continue;

    return {
      headerIndex: r,
      columns: {
        txnDate,
        valueDate: findColumn(headers, VALUE_DATE_KEYS),
        description,
        reference: findColumn(headers, REFERENCE_KEYS),
        debit,
        credit,
        balance,
      },
    };
  }
  return null;
}

function cell(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) return "";
  return row[index] ?? "";
}

function isNonTransactionRow(description: string, debit: number, credit: number): boolean {
  const d = description.toLowerCase();
  if (!d && debit === 0 && credit === 0) return true;
  if (d.includes("opening balance")) return true;
  if (d.includes("closing balance") && debit === 0 && credit === 0) return true;
  if (d.startsWith("brought forward")) return true;
  if (d.startsWith("carried forward")) return true;
  if (d.includes("total") && debit === 0 && credit === 0) return true;
  return false;
}

function extractMetadata(rows: unknown[][], headerIndex: number): {
  accountNumber: string | null;
  accountName: string | null;
  ifscCode: string | null;
  statementStartDate: Date | null;
  statementEndDate: Date | null;
} {
  let accountNumber: string | null = null;
  let accountName: string | null = null;
  let ifscCode: string | null = null;
  let statementStartDate: Date | null = null;
  let statementEndDate: Date | null = null;

  const metaRows = rows.slice(0, headerIndex);
  for (const row of metaRows) {
    const joined = row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
    if (!joined) continue;
    const lower = joined.toLowerCase();

    const accountMatch =
      /account\s*(?:no|number|#)\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined) ??
      /a\/c\s*(?:no|number)?\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined);
    if (accountMatch && !accountNumber) {
      accountNumber = extractDigitsAccountNumber(accountMatch[1] ?? null);
    }

    const nameMatch =
      /account\s*name\s*[:.\-]?\s*(.+)$/i.exec(joined) ??
      /name\s*of\s*(?:the\s*)?account\s*holder\s*[:.\-]?\s*(.+)$/i.exec(joined);
    if (nameMatch && !accountName) {
      accountName = nameMatch[1]!.trim().slice(0, 150) || null;
    }

    const ifscMatch = /\bIFSC\s*(?:code)?\s*[:.\-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i.exec(joined);
    if (ifscMatch && !ifscCode) {
      ifscCode = ifscMatch[1]!.toUpperCase();
    }

    const periodMatch =
      /(?:statement\s*period|period|from)\s*[:.\-]?\s*([0-9A-Za-z\/\-\s]+?)\s+(?:to|-)\s+([0-9A-Za-z\/\-\s]+)/i.exec(
        joined,
      );
    if (periodMatch) {
      statementStartDate = parseStatementDate(periodMatch[1]);
      statementEndDate = parseStatementDate(periodMatch[2]);
    }

    // Two-cell layouts: ["Account Number", "44431999106"]
    if (row.length >= 2) {
      const key = normalizeHeaderKey(row[0]);
      const value = String(row[1] ?? "").trim();
      if ((key.includes("account no") || key === "account number" || key === "a c no") && !accountNumber) {
        accountNumber = extractDigitsAccountNumber(value);
      }
      if ((key === "account name" || key.includes("account holder")) && !accountName) {
        accountName = value.slice(0, 150) || null;
      }
      if (key.includes("ifsc") && !ifscCode) {
        const m = /([A-Z]{4}0[A-Z0-9]{6})/i.exec(value);
        ifscCode = m?.[1]?.toUpperCase() ?? null;
      }
    }

    void lower;
  }

  return { accountNumber, accountName, ifscCode, statementStartDate, statementEndDate };
}

/**
 * Parses State Bank of India OnlineSBI / YONO tabular statement exports (.xlsx/.xls/.csv).
 * Maps account from statement metadata (account number), not filename.
 */
export class SBIStatementParser implements BankStatementParser {
  readonly parserType = "SBI" as const;

  async parse(tempFilePath: string): Promise<ParsedBankStatement> {
    const workbook = readWorkbookFromPath(tempFilePath);
    const { rows } = sheetRowsFromWorkbook(workbook);
    if (rows.length === 0) {
      throw new BankStatementParseError("SBI statement is empty.", "EMPTY_STATEMENT");
    }

    const header = detectHeaderRow(rows);
    if (!header) {
      throw new BankStatementParseError(
        "Could not find SBI transaction header row (Txn Date / Description / Debit-Credit / Balance).",
        "PARSER_ERROR",
      );
    }

    const meta = extractMetadata(rows, header.headerIndex);
    const warnings: string[] = [];
    const transactions: NormalizedBankTransaction[] = [];
    let sequence = 0;

    for (let r = header.headerIndex + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      if (row.every((c) => String(c ?? "").trim() === "")) continue;

      const description = String(cell(row, header.columns.description) ?? "").trim();
      const debit = parseStatementAmount(cell(row, header.columns.debit));
      const credit = parseStatementAmount(cell(row, header.columns.credit));
      const runningBalance = parseStatementAmount(cell(row, header.columns.balance));

      if (isNonTransactionRow(description, debit, credit)) continue;

      const transactionDate = parseStatementDate(cell(row, header.columns.txnDate));
      if (!transactionDate) {
        warnings.push(`Skipped row ${r + 1}: invalid transaction date.`);
        continue;
      }

      if (debit === 0 && credit === 0) {
        warnings.push(`Skipped row ${r + 1}: both debit and credit are zero.`);
        continue;
      }

      const valueDate = header.columns.valueDate
        ? parseStatementDate(cell(row, header.columns.valueDate))
        : null;

      let referenceNumber =
        String(cell(row, header.columns.reference) ?? "")
          .trim()
          .replace(/\s+/g, "") || null;
      if (!referenceNumber) {
        referenceNumber = extractReferenceFromNarration(description);
      }

      sequence += 1;
      transactions.push({
        transactionDate,
        valueDate,
        description: description || "—",
        referenceNumber,
        debitAmount: debit,
        creditAmount: credit,
        runningBalance,
        statementSequence: sequence,
        sourceRowNumber: r + 1,
      });
    }

    if (transactions.length === 0) {
      throw new BankStatementParseError("No SBI transactions found in statement.", "EMPTY_STATEMENT");
    }

    const statementStartDate =
      meta.statementStartDate ?? transactions[0]!.transactionDate;
    const statementEndDate =
      meta.statementEndDate ?? transactions[transactions.length - 1]!.transactionDate;

    if (!meta.accountNumber) {
      warnings.push("Account number not found in statement metadata; mapping may require manual account selection.");
    }

    return {
      parserType: "SBI",
      account: {
        accountNumber: meta.accountNumber,
        accountName: meta.accountName,
        ifscCode: meta.ifscCode,
      },
      statementStartDate,
      statementEndDate,
      transactions,
      warnings,
    };
  }
}

/** True when sheet content looks like an SBI tabular export. */
export function looksLikeSbiStatement(rows: unknown[][]): boolean {
  const sample = rows
    .slice(0, 50)
    .map((row) => row.map((c) => String(c ?? "")).join(" "))
    .join("\n")
    .toLowerCase();

  if (sample.includes("state bank of india")) return true;
  if (/\bsbi\b/.test(sample) && sample.includes("balance")) return true;
  if (detectHeaderRow(rows) && (sample.includes("txn date") || sample.includes("value date"))) {
    return true;
  }
  return Boolean(detectHeaderRow(rows) && sample.includes("ref no"));
}
