import { existsSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  deleteTempBankStatementFile,
  isAllowedBankStatementFilename,
  runWithTempBankStatementFile,
  tempBankStatementFileExists,
  writeTempBankStatementFile,
} from "@/lib/bank-statement-temp";
import { processBufferWithGuaranteedTempCleanup } from "@/lib/bank-statement-import-service";
import { FixtureCsvBankStatementParser } from "@/lib/bank-statement-parser";
import { BankStatementParseError } from "@/lib/bank-statement-types";

const FIXTURE_CSV = [
  "date,description,reference,debit,credit,balance",
  "2026-08-01,NEFT CR CUSTOMER,UTR111,0,1000,1000",
  "2026-08-02,CHQ PAID,CHQ22,200,0,800",
].join("\n");

describe("bank statement temp file lifecycle", () => {
  it("accepts spreadsheet extensions only", () => {
    expect(isAllowedBankStatementFilename("sbi.xlsx")).toBe(true);
    expect(isAllowedBankStatementFilename("sbi.XLS")).toBe(true);
    expect(isAllowedBankStatementFilename("sbi.csv")).toBe(true);
    expect(isAllowedBankStatementFilename("sbi.pdf")).toBe(false);
    expect(isAllowedBankStatementFilename("sbi.exe")).toBe(false);
  });

  it("deletes the temporary file after successful processing", async () => {
    const buffer = Buffer.from(FIXTURE_CSV, "utf8");
    let capturedPath = "";

    const { result, tempPath, fileDeleted } = await runWithTempBankStatementFile(
      "fixture.csv",
      buffer,
      async (path) => {
        capturedPath = path;
        expect(tempBankStatementFileExists(path)).toBe(true);
        const parser = new FixtureCsvBankStatementParser("44431999106");
        return parser.parse(path);
      },
    );

    expect(result.transactions).toHaveLength(2);
    expect(fileDeleted).toBe(true);
    expect(existsSync(tempPath)).toBe(false);
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("deletes the temporary file after processing failure", async () => {
    const buffer = Buffer.from(FIXTURE_CSV, "utf8");
    let capturedPath = "";

    await expect(
      runWithTempBankStatementFile("fixture.csv", buffer, async (path) => {
        capturedPath = path;
        expect(existsSync(path)).toBe(true);
        throw new BankStatementParseError("boom", "PARSER_ERROR");
      }),
    ).rejects.toThrow("boom");

    expect(capturedPath).not.toBe("");
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("processBufferWithGuaranteedTempCleanup removes file on success and failure", async () => {
    const buffer = Buffer.from("date,description,debit,credit,balance\n2026-01-01,x,0,1,1\n");

    const ok = await processBufferWithGuaranteedTempCleanup(
      "ok.csv",
      buffer,
      async (path) => {
        expect(existsSync(path)).toBe(true);
        return "done";
      },
    );
    expect(ok.result).toBe("done");
    expect(ok.fileDeleted).toBe(true);
    expect(existsSync(ok.tempPath)).toBe(false);

    let failedPath = "";
    await expect(
      processBufferWithGuaranteedTempCleanup("fail.csv", buffer, async (path) => {
        failedPath = path;
        throw new Error("forced failure");
      }),
    ).rejects.toThrow("forced failure");
    expect(existsSync(failedPath)).toBe(false);
  });

  it("deleteTempBankStatementFile is idempotent for missing paths", async () => {
    const { tempPath } = await writeTempBankStatementFile(
      "once.csv",
      Buffer.from("a,b\n1,2\n"),
    );
    expect(await deleteTempBankStatementFile(tempPath)).toBe(true);
    expect(await deleteTempBankStatementFile(tempPath)).toBe(false);
    expect(await deleteTempBankStatementFile(null)).toBe(false);
  });

  it("never persists a permanent storage URL field — only temp paths exist during work", async () => {
    const buffer = Buffer.from(FIXTURE_CSV, "utf8");
    await runWithTempBankStatementFile("fixture.csv", buffer, async (path) => {
      expect(path.includes("ivaan-ops-bank-statements")).toBe(true);
      expect(path.startsWith("http")).toBe(false);
      expect(path.includes("://")).toBe(false);
      return true;
    });
  });
});
