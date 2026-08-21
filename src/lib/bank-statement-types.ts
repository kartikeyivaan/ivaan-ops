import type { BankStatementParserType } from "@prisma/client";

/** Common normalized transaction contract returned by all bank parsers. */
export type NormalizedBankTransaction = {
  transactionDate: Date;
  valueDate: Date | null;
  description: string;
  referenceNumber: string | null;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  statementSequence: number;
  sourceRowNumber: number | null;
};

export type ParsedBankStatementAccount = {
  accountNumber: string | null;
  accountName: string | null;
  ifscCode: string | null;
};

export type ParsedBankStatement = {
  parserType: BankStatementParserType;
  account: ParsedBankStatementAccount;
  statementStartDate: Date | null;
  statementEndDate: Date | null;
  transactions: NormalizedBankTransaction[];
  warnings: string[];
};

export interface BankStatementParser {
  readonly parserType: BankStatementParserType;
  parse(tempFilePath: string): Promise<ParsedBankStatement>;
}

export class BankStatementParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PARSER_ERROR"
      | "ACCOUNT_MAPPING_ERROR"
      | "UNSUPPORTED_PARSER"
      | "EMPTY_STATEMENT" = "PARSER_ERROR",
  ) {
    super(message);
    this.name = "BankStatementParseError";
  }
}
