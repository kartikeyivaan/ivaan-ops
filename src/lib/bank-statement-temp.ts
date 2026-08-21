import { createHash, randomUUID } from "crypto";
import { createWriteStream, existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const TEMP_DIR_NAME = "ivaan-ops-bank-statements";

export const BANK_STATEMENT_ALLOWED_EXTENSIONS = [
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
] as const;

export type BankStatementAllowedExtension =
  (typeof BANK_STATEMENT_ALLOWED_EXTENSIONS)[number];

export function getBankStatementTempRoot(): string {
  return join(tmpdir(), TEMP_DIR_NAME);
}

export function normalizeBankStatementExtension(filename: string): string {
  const lower = filename.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function isAllowedBankStatementFilename(filename: string): boolean {
  const ext = normalizeBankStatementExtension(filename);
  return (BANK_STATEMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function assertAllowedBankStatementFilename(filename: string): void {
  if (!filename.trim()) {
    throw new Error("FILENAME_REQUIRED");
  }
  if (!isAllowedBankStatementFilename(filename)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
}

/** Sanitize original filename for temp path use (no path segments). */
export function sanitizeBankStatementFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "_").replace(/\0/g, "").trim();
  return base.slice(0, 180) || "statement.bin";
}

export async function ensureBankStatementTempRoot(): Promise<string> {
  const root = getBankStatementTempRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export async function createTempBankStatementPath(originalFilename: string): Promise<string> {
  const root = await ensureBankStatementTempRoot();
  const safe = sanitizeBankStatementFilename(originalFilename);
  return join(root, `${Date.now()}-${randomUUID()}-${safe}`);
}

export async function writeTempBankStatementFile(
  originalFilename: string,
  contents: Buffer | Uint8Array,
): Promise<{ tempPath: string; byteLength: number }> {
  assertAllowedBankStatementFilename(originalFilename);
  const tempPath = await createTempBankStatementPath(originalFilename);
  await writeFile(tempPath, contents);
  return { tempPath, byteLength: contents.byteLength };
}

export async function writeTempBankStatementFromStream(
  originalFilename: string,
  stream: Readable,
): Promise<{ tempPath: string }> {
  assertAllowedBankStatementFilename(originalFilename);
  const tempPath = await createTempBankStatementPath(originalFilename);
  await pipeline(stream, createWriteStream(tempPath));
  return { tempPath };
}

export async function hashBankStatementFile(tempPath: string): Promise<string> {
  const buffer = await readFile(tempPath);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function hashBankStatementBuffer(contents: Buffer | Uint8Array): Promise<string> {
  return createHash("sha256").update(contents).digest("hex");
}

/**
 * Deletes a temporary statement file. Missing files are treated as already cleaned up.
 * Never leaves a permanent storage URL — callers must not persist tempPath.
 */
export async function deleteTempBankStatementFile(tempPath: string | null | undefined): Promise<boolean> {
  if (!tempPath) return false;
  try {
    if (!existsSync(tempPath)) return false;
    await unlink(tempPath);
    return true;
  } catch {
    // Best-effort cleanup; caller still records fileDeletedAt when appropriate.
    try {
      if (existsSync(tempPath)) await unlink(tempPath);
    } catch {
      return false;
    }
    return false;
  }
}

export function tempBankStatementFileExists(tempPath: string): boolean {
  return existsSync(tempPath);
}

/**
 * Writes the upload to a temp path, runs work, then always deletes the temp file in `finally`.
 * Use this for all statement processing so success and failure both remove the original file.
 */
export async function runWithTempBankStatementFile<T>(
  originalFilename: string,
  contents: Buffer | Uint8Array,
  work: (tempPath: string) => Promise<T>,
): Promise<{ result: T; tempPath: string; fileDeleted: boolean }> {
  const { tempPath } = await writeTempBankStatementFile(originalFilename, contents);
  let result!: T;
  let workError: unknown;
  let fileDeleted = false;
  try {
    result = await work(tempPath);
  } catch (err) {
    workError = err;
  } finally {
    fileDeleted = await deleteTempBankStatementFile(tempPath);
  }
  if (workError) {
    throw workError;
  }
  return { result, tempPath, fileDeleted };
}
