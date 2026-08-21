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

const TXN_DATE_KEYS = new Set(["date", "txn date", "tran date", "transaction date"]);

const VALUE_DATE_KEYS = new Set(["value dt", "value date", "val date"]);

const DESCRIPTION_KEYS = new Set(["narration", "description", "particulars", "remarks"]);

const REFERENCE_KEYS = new Set([
  "chq ref no",
  "chq no",
  "cheque no",
  "ref no",
  "reference no",
  "reference number",
]);

const DEBIT_KEYS = new Set([
  "withdrawal amt",
  "withdrawal amount",
  "withdrawal",
  "debit",
  "debit amount",
]);

const CREDIT_KEYS = new Set([
  "deposit amt",
  "deposit amount",
  "deposit",
  "credit",
  "credit amount",
]);

const BALANCE_KEYS = new Set(["closing balance", "balance", "running balance"]);

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

    // Prefer classic HDFC NetBanking headers.
    const looksHdfc =
      headers.includes("narration") ||
      headers.includes("withdrawal amt") ||
      headers.includes("deposit amt") ||
      headers.includes("closing balance");
    if (!looksHdfc) continue;

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

function isSeparatorOrJunkRow(row: unknown[]): boolean {
  const joined = row.map((c) => String(c ?? "").trim()).join("");
  if (!joined) return true;
  // HDFC inserts a row of asterisks under the header.
  if (/^\*+$/.test(joined.replace(/\s+/g, ""))) return true;
  return false;
}

function isNonTransactionRow(description: string, debit: number, credit: number): boolean {
  const d = description.toLowerCase();
  if (!d && debit === 0 && credit === 0) return true;
  if (d.includes("opening balance")) return true;
  if (d.includes("closing balance") && debit === 0 && credit === 0) return true;
  if (d.startsWith("brought forward") || d.startsWith("carried forward")) return true;
  if (d.includes("this is a computer generated") || d.includes("statement summary")) return true;
  if ((d.includes("dr count") || d.includes("cr count")) && debit === 0 && credit === 0) return true;
  // HDFC statement summary value row has both debit and credit totals populated.
  if (debit > 0 && credit > 0) return true;
  return false;
}

function isStatementEndMarker(row: unknown[]): boolean {
  const joined = row
    .map((c) => String(c ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!joined) return false;
  if (joined.includes("statement summary")) return true;
  if (joined.includes("end of statement")) return true;
  if (joined.startsWith("generated on")) return true;
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
    for (const rawCell of row) {
      const joined = String(rawCell ?? "").trim();
      if (!joined) continue;

      const accountMatch =
        /account\s*no\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined) ??
        /a\/c\s*(?:no|number)?\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined);
      if (accountMatch && !accountNumber) {
        accountNumber = extractDigitsAccountNumber(accountMatch[1] ?? null);
      }

      const ifscMatch =
        /(?:RTGS\/NEFT\s*)?IFSC\s*[:.\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i.exec(joined) ??
        /\b(HDFC0[A-Z0-9]{6})\b/i.exec(joined);
      if (ifscMatch && !ifscCode) {
        ifscCode = ifscMatch[1]!.toUpperCase();
      }

      // "Statement From  :  01/04/2026         To  :  20/08/2026"
      const periodMatch =
        /statement\s*from\s*[:.\-]?\s*([0-9\/\-.]+)\s+to\s*[:.\-]?\s*([0-9\/\-.]+)/i.exec(joined) ??
        /from\s*[:.\-]?\s*([0-9\/\-.]+)\s+to\s*[:.\-]?\s*([0-9\/\-.]+)/i.exec(joined);
      if (periodMatch) {
        statementStartDate = parseStatementDate(periodMatch[1]);
        statementEndDate = parseStatementDate(periodMatch[2]);
      }

      // Account name often appears as "M/S.    IVAAN SOLAR ENERGY" in the left header block.
      if (!accountName) {
        const msMatch = /^M\/S\.?\s*(.+)$/i.exec(joined);
        if (msMatch) {
          accountName = msMatch[1]!.trim().slice(0, 150) || null;
        }
      }
    }
  }

  return { accountNumber, accountName, ifscCode, statementStartDate, statementEndDate };
}

/**
 * Parses HDFC Bank NetBanking tabular statement exports (.xls/.xlsx).
 * Typical headers: Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance
 */
export class HDFCStatementParser implements BankStatementParser {
  readonly parserType = "HDFC" as const;

  async parse(tempFilePath: string): Promise<ParsedBankStatement> {
    const workbook = readWorkbookFromPath(tempFilePath);
    const { rows } = sheetRowsFromWorkbook(workbook);
    if (rows.length === 0) {
      throw new BankStatementParseError("HDFC statement is empty.", "EMPTY_STATEMENT");
    }

    const header = detectHeaderRow(rows);
    if (!header) {
      throw new BankStatementParseError(
        "Could not find HDFC transaction header row (Date / Narration / Withdrawal-Deposit / Closing Balance).",
        "PARSER_ERROR",
      );
    }

    const meta = extractMetadata(rows, header.headerIndex);
    const warnings: string[] = [];
    const transactions: NormalizedBankTransaction[] = [];
    let sequence = 0;

    for (let r = header.headerIndex + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      if (isSeparatorOrJunkRow(row)) continue;
      if (isStatementEndMarker(row)) break;

      const description = String(cell(row, header.columns.description) ?? "").trim();
      const debit = parseStatementAmount(cell(row, header.columns.debit));
      const credit = parseStatementAmount(cell(row, header.columns.credit));
      const runningBalance = parseStatementAmount(cell(row, header.columns.balance));

      if (isNonTransactionRow(description, debit, credit)) continue;

      // Real HDFC ledger rows always carry narration; footer value rows do not.
      if (!description) continue;

      const dateRaw = cell(row, header.columns.txnDate);
      if (!String(dateRaw ?? "").trim()) continue;

      const transactionDate = parseStatementDate(dateRaw);
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
      throw new BankStatementParseError("No HDFC transactions found in statement.", "EMPTY_STATEMENT");
    }

    const statementStartDate =
      meta.statementStartDate ?? transactions[0]!.transactionDate;
    const statementEndDate =
      meta.statementEndDate ?? transactions[transactions.length - 1]!.transactionDate;

    if (!meta.accountNumber) {
      warnings.push(
        "Account number not found in statement metadata; mapping may require manual account selection.",
      );
    }

    return {
      parserType: "HDFC",
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

/** True when sheet content looks like an HDFC NetBanking tabular export. */
export function looksLikeHdfcStatement(rows: unknown[][]): boolean {
  const sample = rows
    .slice(0, 50)
    .map((row) => row.map((c) => String(c ?? "")).join(" "))
    .join("\n")
    .toLowerCase();

  // OnlineSBI / YONO exports use Txn Date + Debit/Credit — never treat as HDFC.
  if (sample.includes("txn date") && sample.includes("debit") && sample.includes("credit")) {
    return false;
  }
  // Account IFSC labeled SBIN… means this is an SBI statement (ignore HDFC in narrations).
  if (/ifs(?:c)?\s*code\s*:?\s*sbin0/i.test(sample)) {
    return false;
  }

  if (
    sample.includes("withdrawal amt") &&
    sample.includes("deposit amt") &&
    (sample.includes("narration") || sample.includes("closing balance"))
  ) {
    return true;
  }
  // Statement-header IFSC only (not counterparty NEFT*HDFC0… / "HDFC BANK LTD" in narration).
  if (/rtgs\/neft\s*ifsc\s*:?\s*hdfc0/i.test(sample) && sample.includes("narration")) {
    return true;
  }
  // Branding in the title block is OK only with classic HDFC columns already checked above,
  // or when the HDFC header row detector succeeds (Narration / Withdrawal / Closing Balance).
  return Boolean(detectHeaderRow(rows));
}
