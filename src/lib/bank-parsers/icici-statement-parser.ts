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
  parseStatementSignedAmount,
  readWorkbookFromPath,
  sheetRowsFromWorkbook,
} from "@/lib/bank-parsers/parse-utils";

type ColumnMap = {
  valueDate: number | null;
  postedDate: number | null;
  description: number;
  reference: number | null;
  cheque: number | null;
  crDr: number;
  amount: number;
  balance: number;
};

const VALUE_DATE_KEYS = new Set(["value date", "value dt", "val date"]);
const POSTED_DATE_KEYS = new Set([
  "txn posted date",
  "transaction posted date",
  "posted date",
  "txn date",
  "transaction date",
]);
const DESCRIPTION_KEYS = new Set(["description", "narration", "particulars", "remarks"]);
const REFERENCE_KEYS = new Set([
  "transaction id",
  "txn id",
  "tran id",
  "ref no",
  "reference no",
  "reference number",
]);
const CHEQUE_KEYS = new Set(["chequeno", "cheque no", "chq no", "cheque number"]);
const CR_DR_KEYS = new Set(["cr dr", "dr cr", "type", "txn type", "transaction type"]);
const AMOUNT_KEYS = new Set([
  "transaction amount inr",
  "transaction amount",
  "amount inr",
  "amount",
  "txn amount",
]);
const BALANCE_KEYS = new Set([
  "available balance inr",
  "available balance",
  "balance inr",
  "balance",
  "running balance",
]);

function findColumn(headers: string[], keys: Set<string>): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    if (keys.has(headers[i]!)) return i;
  }
  return null;
}

function detectHeaderRow(rows: unknown[][]): { headerIndex: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeHeaderKey);
    const description = findColumn(headers, DESCRIPTION_KEYS);
    const crDr = findColumn(headers, CR_DR_KEYS);
    const amount = findColumn(headers, AMOUNT_KEYS);
    const balance = findColumn(headers, BALANCE_KEYS);
    const valueDate = findColumn(headers, VALUE_DATE_KEYS);
    const postedDate = findColumn(headers, POSTED_DATE_KEYS);

    if (description === null || crDr === null || amount === null || balance === null) continue;
    if (valueDate === null && postedDate === null) continue;

    return {
      headerIndex: r,
      columns: {
        valueDate,
        postedDate,
        description,
        reference: findColumn(headers, REFERENCE_KEYS),
        cheque: findColumn(headers, CHEQUE_KEYS),
        crDr,
        amount,
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

function isCredit(crDrRaw: unknown): boolean | null {
  const text = String(crDrRaw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!text) return null;
  if (text === "CR" || text === "CREDIT" || text === "C") return true;
  if (text === "DR" || text === "DEBIT" || text === "D") return false;
  return null;
}

function isNonTransactionRow(description: string, amount: number): boolean {
  const d = description.toLowerCase();
  if (!d && amount === 0) return true;
  if (d.includes("opening balance") || d.includes("closing balance")) return true;
  if (d.includes("brought forward") || d.includes("carried forward")) return true;
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

  const metaRows = rows.slice(0, headerIndex);
  for (const row of metaRows) {
    for (const rawCell of row) {
      const joined = String(rawCell ?? "").trim();
      if (!joined) continue;

      // "Transactions List -   -IVAAN SOLAR ENERGY (INR) - 037505012379"
      const listMatch =
        /transactions\s*list\s*[-–—]+\s*[-–—]*\s*(.+?)\s*\((?:INR|USD|EUR)\)\s*[-–—]+\s*([0-9\s\-]+)/i.exec(
          joined,
        );
      if (listMatch) {
        if (!accountName) accountName = listMatch[1]!.trim().slice(0, 150) || null;
        if (!accountNumber) accountNumber = extractDigitsAccountNumber(listMatch[2] ?? null);
      }

      const accountMatch =
        /account\s*(?:no|number|#)\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined) ??
        /a\/c\s*(?:no|number)?\s*[:.\-]?\s*([0-9\s\-]+)/i.exec(joined);
      if (accountMatch && !accountNumber) {
        accountNumber = extractDigitsAccountNumber(accountMatch[1] ?? null);
      }

      const ifscMatch = /\bIFSC\s*(?:code)?\s*[:.\-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i.exec(joined);
      if (ifscMatch && !ifscCode) {
        ifscCode = ifscMatch[1]!.toUpperCase();
      }
    }
  }

  return {
    accountNumber,
    accountName,
    ifscCode,
    statementStartDate: null,
    statementEndDate: null,
  };
}

/**
 * Parses ICICI Bank Corporate/NetBanking OpTransactionHistory exports (.xls/.xlsx).
 * Layout: No. | Transaction ID | Value Date | Txn Posted Date | ChequeNo. | Description | Cr/Dr | Amount | Available Balance
 */
export class ICICIStatementParser implements BankStatementParser {
  readonly parserType = "ICICI" as const;

  async parse(tempFilePath: string): Promise<ParsedBankStatement> {
    const workbook = readWorkbookFromPath(tempFilePath);
    const { rows } = sheetRowsFromWorkbook(workbook);
    if (rows.length === 0) {
      throw new BankStatementParseError("ICICI statement is empty.", "EMPTY_STATEMENT");
    }

    const header = detectHeaderRow(rows);
    if (!header) {
      throw new BankStatementParseError(
        "Could not find ICICI transaction header row (Value/Posted Date / Description / Cr/Dr / Amount / Balance).",
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
      const amount = parseStatementAmount(cell(row, header.columns.amount));
      const runningBalance = parseStatementSignedAmount(cell(row, header.columns.balance));

      if (isNonTransactionRow(description, amount)) continue;

      const valueDate = header.columns.valueDate
        ? parseStatementDate(cell(row, header.columns.valueDate))
        : null;
      const postedDate = header.columns.postedDate
        ? parseStatementDate(cell(row, header.columns.postedDate))
        : null;
      const transactionDate = valueDate ?? postedDate;
      if (!transactionDate) {
        warnings.push(`Skipped row ${r + 1}: invalid transaction date.`);
        continue;
      }

      const creditFlag = isCredit(cell(row, header.columns.crDr));
      if (creditFlag === null) {
        warnings.push(`Skipped row ${r + 1}: missing or invalid Cr/Dr.`);
        continue;
      }
      if (amount === 0) {
        warnings.push(`Skipped row ${r + 1}: transaction amount is zero.`);
        continue;
      }

      const debitAmount = creditFlag ? 0 : amount;
      const creditAmount = creditFlag ? amount : 0;

      let referenceNumber =
        String(cell(row, header.columns.reference) ?? "")
          .trim()
          .replace(/\s+/g, "") || null;
      if (!referenceNumber || referenceNumber === "-") {
        const cheque = String(cell(row, header.columns.cheque) ?? "")
          .trim()
          .replace(/\s+/g, "");
        referenceNumber = cheque && cheque !== "-" ? cheque : null;
      }
      if (!referenceNumber) {
        referenceNumber = extractReferenceFromNarration(description);
      }

      sequence += 1;
      transactions.push({
        transactionDate,
        valueDate,
        description: description || "—",
        referenceNumber,
        debitAmount,
        creditAmount,
        runningBalance,
        statementSequence: sequence,
        sourceRowNumber: r + 1,
      });
    }

    if (transactions.length === 0) {
      throw new BankStatementParseError("No ICICI transactions found in statement.", "EMPTY_STATEMENT");
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
      parserType: "ICICI",
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

/** True when sheet content looks like an ICICI OpTransactionHistory export. */
export function looksLikeIciciStatement(rows: unknown[][]): boolean {
  const sample = rows
    .slice(0, 40)
    .map((row) => row.map((c) => String(c ?? "")).join(" "))
    .join("\n")
    .toLowerCase();

  if (sample.includes("optransactionhistory")) return true;
  if (sample.includes("txn posted date") && sample.includes("cr/dr")) return true;
  if (
    sample.includes("available balance") &&
    sample.includes("transaction amount") &&
    sample.includes("cr/dr")
  ) {
    return true;
  }
  if (sample.includes("transactions list") && sample.includes("transaction id")) return true;
  return Boolean(detectHeaderRow(rows));
}
